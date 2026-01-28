import type { Env, MovieQueueMessage } from '../types';
import { handleMovieRoast } from './movieRoast';

/**
 * Queue consumer handler for processing individual movies
 * Each invocation gets its own subrequest budget, avoiding Worker limits
 */
export async function handleMovieQueueBatch(
  batch: MessageBatch<MovieQueueMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    const { movieId, title, correlationId } = message.body;
    const startTime = Date.now();
    
    try {
      // Check if roast already exists in roasts table (source of truth)
      const existingRoast = await env.plotburn_db.prepare(
        'SELECT id FROM roasts WHERE movie_id = ? AND is_active = 1'
      ).bind(movieId).first();
      
      if (existingRoast) {
        console.log(`[Queue][${correlationId}] Skipping ${title} - roast already exists`);
        message.ack();
        continue;
      }
      
      // Process movie roast (this will create entry in roasts table)
      console.log(`[Queue][${correlationId}] Processing ${title}...`);
      await handleMovieRoast(String(movieId), env, `${correlationId}-m${movieId}`);
      const processingTime = Date.now() - startTime;
      
      console.log(`[Queue][${correlationId}] ✓ ${title} (${processingTime}ms)`);
      message.ack();
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Queue][${correlationId}] ✗ ${title}:`, errorMsg);
      
      // Retry the message (Cloudflare handles retry logic based on max_retries)
      message.retry();
    }
  }
}
