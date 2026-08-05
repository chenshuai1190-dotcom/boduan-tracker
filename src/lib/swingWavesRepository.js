import { scopedDeleteById } from './dbGuards.js';
import {
  buildSwingWaveExitInput,
  buildSwingWaveCompletionRow,
  buildSwingWaveCreateRow,
  buildSwingWaveUpdateRow,
  isLegacySwingWaveExitId,
  mapSwingWave,
} from './swingWavesModel.js';

const TABLE = 'swing_waves';
const WAVE_SELECT = '*,swing_wave_exits(*)';

function requireClient(client) {
  if (!client?.auth?.getUser || !client?.from) {
    throw new Error('Supabase 配置缺失: 无法访问波段记录');
  }
  return client;
}

function requireRpc(client) {
  if (typeof requireClient(client).rpc !== 'function') {
    throw new Error('Supabase 配置缺失: 无法保存波段卖出记录');
  }
  return client;
}

async function resolveUser(client, preUser = null) {
  if (preUser?.id) return preUser;
  const { data, error } = await requireClient(client).auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

async function requireUser(client) {
  const user = await resolveUser(client);
  if (!user?.id) throw new Error('未登录');
  return user;
}

async function findOwnedWave(client, id, userId) {
  if (!id) throw new Error('缺少波段记录');
  const { data, error } = await requireClient(client)
    .from(TABLE)
    .select(WAVE_SELECT)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('波段不存在');
  return mapSwingWave(data);
}

export function createSwingWavesRepository(client) {
  return {
    async list(preUser = null) {
      const user = await resolveUser(client, preUser);
      if (!user?.id) return [];

      const { data, error } = await requireClient(client)
        .from(TABLE)
        .select(WAVE_SELECT)
        .eq('user_id', user.id)
        .order('buy_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapSwingWave).filter((wave) => wave?.symbol);
    },

    async create(input) {
      const user = await requireUser(client);
      const row = buildSwingWaveCreateRow(input, user.id);
      const { data, error } = await requireClient(client)
        .from(TABLE)
        .insert(row)
        .select(WAVE_SELECT)
        .single();
      if (error) throw error;
      return mapSwingWave(data);
    },

    async update(id, input) {
      const user = await requireUser(client);
      const currentWave = await findOwnedWave(client, id, user.id);
      const row = buildSwingWaveUpdateRow(currentWave, input);
      const { data, error } = await requireClient(client)
        .from(TABLE)
        .update(row)
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('updated_at', currentWave.updatedAt)
        .select(WAVE_SELECT)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('记录已被其他设备修改，请刷新后重试');
      return mapSwingWave(data);
    },

    async complete(id, input) {
      const user = await requireUser(client);
      const currentWave = await findOwnedWave(client, id, user.id);
      const row = buildSwingWaveCompletionRow(currentWave, input);
      const { data, error } = await requireClient(client)
        .from(TABLE)
        .update(row)
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('updated_at', currentWave.updatedAt)
        .is('sell_date', null)
        .is('sell_price_usd', null)
        .select(WAVE_SELECT)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('记录已被其他设备修改，请刷新后重试');
      return mapSwingWave(data);
    },

    async sell(id, input) {
      const user = await requireUser(client);
      const currentWave = await findOwnedWave(client, id, user.id);
      const exit = buildSwingWaveExitInput(currentWave, input);
      if (exit.sellShares > currentWave.remainingShares + 1e-9) {
        throw new Error('卖出股数不能超过剩余股数');
      }

      const { error } = await requireRpc(client).rpc('record_swing_wave_exit', {
        p_wave_id: id,
        p_sell_date: exit.sellDate,
        p_sell_price_usd: exit.sellPriceUsd,
        p_sell_shares: exit.sellShares,
        p_expected_wave_updated_at: currentWave.updatedAt,
      });
      if (error) throw error;
      return findOwnedWave(client, id, user.id);
    },

    async updateExit(id, exitId, input) {
      const user = await requireUser(client);
      const currentWave = await findOwnedWave(client, id, user.id);
      const currentExit = currentWave.exits.find((exit) => exit.id === exitId);
      if (!currentExit) throw new Error('卖出记录不存在');

      const exit = buildSwingWaveExitInput(currentWave, input);
      const soldWithoutCurrent = currentWave.soldShares - currentExit.shares;
      if (soldWithoutCurrent + exit.sellShares > currentWave.shares + 1e-9) {
        throw new Error('卖出股数不能超过剩余股数');
      }

      const { error } = await requireRpc(client).rpc('update_swing_wave_exit', {
        p_wave_id: id,
        p_exit_id: isLegacySwingWaveExitId(exitId, id) ? null : exitId,
        p_sell_date: exit.sellDate,
        p_sell_price_usd: exit.sellPriceUsd,
        p_sell_shares: exit.sellShares,
        p_expected_wave_updated_at: currentWave.updatedAt,
        p_expected_exit_updated_at: currentExit.updatedAt,
      });
      if (error) throw error;
      return findOwnedWave(client, id, user.id);
    },

    async deleteExit(id, exitId) {
      const user = await requireUser(client);
      const currentWave = await findOwnedWave(client, id, user.id);
      const currentExit = currentWave.exits.find((exit) => exit.id === exitId);
      if (!currentExit) throw new Error('卖出记录不存在');

      const { error } = await requireRpc(client).rpc('delete_swing_wave_exit', {
        p_wave_id: id,
        p_exit_id: isLegacySwingWaveExitId(exitId, id) ? null : exitId,
        p_expected_wave_updated_at: currentWave.updatedAt,
        p_expected_exit_updated_at: currentExit.updatedAt,
      });
      if (error) throw error;
      return findOwnedWave(client, id, user.id);
    },

    async delete(id) {
      const user = await requireUser(client);
      const currentWave = await findOwnedWave(client, id, user.id);
      const { data, error } = await scopedDeleteById(
        requireClient(client).from(TABLE),
        id,
        user.id,
      )
        .eq('updated_at', currentWave.updatedAt)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('记录已被其他设备修改，请刷新后重试');
    },
  };
}
