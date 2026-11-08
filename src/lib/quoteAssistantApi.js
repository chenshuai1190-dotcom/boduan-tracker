import { supabase } from './supabase';
import { createQuoteAssistantRepository } from './quoteAssistantRepository.js';
export const quoteAssistantApi = createQuoteAssistantRepository(supabase);
