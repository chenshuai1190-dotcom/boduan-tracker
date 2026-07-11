import { scopedDeleteById } from './dbGuards.js';
import {
  buildSwingWaveCompletionRow,
  buildSwingWaveCreateRow,
  buildSwingWaveUpdateRow,
  mapSwingWave,
} from './swingWavesModel.js';

const TABLE = 'swing_waves';

function requireClient(client) {
  if (!client?.auth?.getUser || !client?.from) {
    throw new Error('Supabase 配置缺失: 无法访问波段记录');
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
    .select('*')
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
        .select('*')
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
        .select('*')
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
        .select('*')
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
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('记录已被其他设备修改，请刷新后重试');
      return mapSwingWave(data);
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
