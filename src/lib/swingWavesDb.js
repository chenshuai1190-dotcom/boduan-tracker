import { supabase } from './supabase';
import { createSwingWavesRepository } from './swingWavesRepository.js';

const repository = createSwingWavesRepository(supabase);

export const listSwingWaves = (preUser = null) => repository.list(preUser);
export const createSwingWave = (input) => repository.create(input);
export const updateSwingWave = (id, input) => repository.update(id, input);
export const completeSwingWave = (id, input) => repository.complete(id, input);
export const deleteSwingWave = (id) => repository.delete(id);
