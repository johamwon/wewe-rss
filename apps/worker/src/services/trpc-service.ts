import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { defaultCount, statusMap } from '../constants';
import {
  countArticlesByMpId,
  getAvailableAccounts,
  getFeedById,
  listAllFeeds,
  updateFeed,
  upsertArticles,
  updateAccount,
} from './db-queries';
import type { Env } from '../types';

dayjs.extend(utc);
dayjs.extend(timezone);

const blockedAccountsMap = new Map<string, string[]>();

const inProgressHistoryMp = {
  id: '',
  page: 1,
};

let isRefreshAllMpArticlesRunning = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getTodayDate = () =>
  dayjs.tz(new Date(), 'Asia/Shanghai').format('YYYY-MM-DD');

export function getBlockedAccountIds() {
  const today = getTodayDate();
  const disabledAccounts = blockedAccountsMap.get(today) || [];
  return disabledAccounts.filter(Boolean);
}

export function removeBlockedAccount(id: string) {
  const today = getTodayDate();
  const blockedAccounts = blockedAccountsMap.get(today);
  if (Array.isArray(blockedAccounts)) {
    blockedAccountsMap.set(
      today,
      blockedAccounts.filter((item) => item !== id),
    );
  }
}

function getUpdateDelaySeconds(env: Env) {
  const raw = env.UPDATE_DELAY_TIME ?? '60';
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : 60;
}

function getPlatformUrl(env: Env) {
  return env.PLATFORM_URL ?? 'https://weread.111965.xyz';
}

async function fetchJson<T>(
  env: Env,
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
) {
  const controller = new AbortController();
  const { timeoutMs, ...requestInit } = options;
  const timeoutValue = timeoutMs ?? 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutValue);
  try {
    const res = await fetch(`${getPlatformUrl(env)}${path}`, {
      ...requestInit,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T & {
      message?: string;
    };
    if (!res.ok) {
      const error = new Error(data?.message || `Request failed: ${res.status}`);
      (error as any).status = res.status;
      (error as any).data = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getAvailableAccount(env: Env) {
  const blocked = getBlockedAccountIds();
  const accounts = await getAvailableAccounts(env.DB, blocked);
  if (!accounts.length) {
    throw new Error('暂无可用读书账号!');
  }
  return accounts[Math.floor(Math.random() * accounts.length)];
}

async function handleAccountError(env: Env, accountId: string, message = '') {
  const today = getTodayDate();
  const blockedAccounts = blockedAccountsMap.get(today) || [];

  if (message.includes('WeReadError401')) {
    await updateAccount(env.DB, accountId, { status: statusMap.INVALID });
  } else if (message.includes('WeReadError429')) {
    blockedAccounts.push(accountId);
    blockedAccountsMap.set(today, blockedAccounts);
  }
}

export async function getMpArticles(
  env: Env,
  mpId: string,
  page = 1,
  retryCount = 3,
) {
  const account = await getAvailableAccount(env);

  try {
    return await fetchJson<
      {
        id: string;
        title: string;
        picUrl: string;
        publishTime: number;
      }[]
    >(env, `/api/v2/platform/mps/${mpId}/articles?page=${page}`, {
      headers: {
        xid: account.id,
        Authorization: `Bearer ${account.token}`,
      },
    });
  } catch (error: any) {
    const message = error?.data?.message || error.message || '';
    await handleAccountError(env, account.id, message);
    if (retryCount > 0) {
      return getMpArticles(env, mpId, page, retryCount - 1);
    }
    throw error;
  }
}

export async function refreshMpArticlesAndUpdateFeed(
  env: Env,
  mpId: string,
  page = 1,
) {
  const articles = await getMpArticles(env, mpId, page);

  if (articles.length > 0) {
    await upsertArticles(env.DB, mpId, articles);
  }

  const hasHistory = articles.length < defaultCount ? 0 : 1;
  await updateFeed(env.DB, mpId, {
    syncTime: Math.floor(Date.now() / 1e3),
    hasHistory,
  });

  return { hasHistory };
}

export async function getHistoryMpArticles(env: Env, mpId: string) {
  if (inProgressHistoryMp.id === mpId) {
    return;
  }

  inProgressHistoryMp.id = mpId;
  inProgressHistoryMp.page = 1;

  if (!inProgressHistoryMp.id) {
    return;
  }

  try {
    const feed = await getFeedById(env.DB, mpId);
    if (!feed) {
      return;
    }

    if (feed.hasHistory === 0) {
      return;
    }

    const total = await countArticlesByMpId(env.DB, mpId);
    inProgressHistoryMp.page = Math.ceil(total / defaultCount);

    let i = 1000;
    while (i-- > 0) {
      if (inProgressHistoryMp.id !== mpId) {
        break;
      }
      const { hasHistory } = await refreshMpArticlesAndUpdateFeed(
        env,
        mpId,
        inProgressHistoryMp.page,
      );
      if (hasHistory < 1) {
        break;
      }
      inProgressHistoryMp.page++;
      await sleep(getUpdateDelaySeconds(env) * 1000);
    }
  } finally {
    inProgressHistoryMp.id = '';
    inProgressHistoryMp.page = 1;
  }
}

export function getInProgressHistoryMp() {
  return { ...inProgressHistoryMp };
}

export async function refreshAllMpArticlesAndUpdateFeed(env: Env) {
  if (isRefreshAllMpArticlesRunning) {
    return;
  }

  isRefreshAllMpArticlesRunning = true;
  try {
    const feeds = await listAllFeeds(env.DB);
    for (const feed of feeds) {
      await refreshMpArticlesAndUpdateFeed(env, feed.id);
      await sleep(getUpdateDelaySeconds(env) * 1000);
    }
  } finally {
    isRefreshAllMpArticlesRunning = false;
  }
}

export function getIsRefreshAllMpArticlesRunning() {
  return isRefreshAllMpArticlesRunning;
}

export async function getMpInfo(env: Env, url: string) {
  const account = await getAvailableAccount(env);
  try {
    return await fetchJson<
      {
        id: string;
        cover: string;
        name: string;
        intro: string;
        updateTime: number;
      }[]
    >(env, '/api/v2/platform/wxs2mp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        xid: account.id,
        Authorization: `Bearer ${account.token}`,
      },
      body: JSON.stringify({ url: url.trim() }),
    });
  } catch (error: any) {
    const message = error?.data?.message || error.message || '';
    await handleAccountError(env, account.id, message);
    throw error;
  }
}

export async function createLoginUrl(env: Env) {
  return fetchJson<{
    uuid: string;
    scanUrl: string;
  }>(env, '/api/v2/login/platform');
}

export async function getLoginResult(env: Env, id: string) {
  return fetchJson<{
    message: string;
    vid?: number;
    token?: string;
    username?: string;
  }>(env, `/api/v2/login/platform/${id}`, { timeoutMs: 120000 });
}
