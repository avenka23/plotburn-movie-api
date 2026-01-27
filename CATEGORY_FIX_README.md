# PlotBurn Movie API - Category Insertion Fix

## Issues Identified

1. **Popular query not inserting records into movie_categories table**
   - The `addMovieToCategory` function was being called but errors were being silently caught
   - No detailed logging to identify where failures occurred

2. **Existing records not being deleted from the database**
   - The `clearCategory` function was being called but no visibility into whether it succeeded
   - No logging to confirm how many records were actually deleted

## Changes Made

### 1. Enhanced Database Logging (`src/services/database.ts`)

#### `addMovieToCategory` function (lines 85-98)
- **Added**: Console logging before and after the INSERT operation
- **Tracks**: 
  - Movie ID and category being inserted
  - Operation success status
  - Number of changes made
  - Full metadata from the database operation

```typescript
console.log(`[DB] Adding movie ${movieId} to category '${category}'`);
// ... database operation ...
console.log(`[DB] Inserted into movie_categories: success=${result.success}, changes=${result.meta.changes}, movieId=${movieId}, category=${category}`);
```

#### `clearCategory` function (lines 102-111)
- **Added**: Console logging before and after the DELETE operation
- **Tracks**:
  - Category being cleared
  - Operation success status  
  - Number of records deleted

```typescript
console.log(`[DB] Clearing category '${category}'...`);
// ... database operation ...
console.log(`[DB] Cleared category '${category}': success=${result.success}, changes=${result.meta.changes}`);
```

### 2. Enhanced Error Handling (`src/handlers/popular.ts`)

- **Split error handling**: Now separately catches errors from `upsertMovie` and `addMovieToCategory`
- **Better error messages**: Specific error logs for each operation type:
  - `[POPULAR] Failed to upsert movie ...` - indicates movie save failure
  - `[POPULAR] Failed to add movie ... to category` - indicates category association failure
- **Preserve behavior**: Still continues processing other movies even if one fails

### 3. Enhanced Error Handling (`src/handlers/nowPlaying.ts`)

- **Same improvements as popular handler**: Split error handling for both operations
- **Consistent logging**: Same error message format for easier debugging
- **Better error messages**: 
  - `[NOW_PLAYING] Failed to upsert movie ...`
  - `[NOW_PLAYING] Failed to add movie ... to category`

## How to Debug

### Step 1: Deploy the Changes
Deploy your updated code to Cloudflare Workers.

### Step 2: Test the Popular Endpoint
Call the popular movies endpoint and watch the logs:

```bash
# Call the endpoint
curl https://your-api-url/popular

# Watch the Cloudflare Workers logs
wrangler tail
```

### Step 3: Look for These Log Patterns

**Successful Category Clear:**
```
[DB] Clearing category 'popular'...
[DB] Cleared category 'popular': success=true, changes=20
```
- `changes` shows how many existing records were deleted
- If `changes=0`, no existing records were found (expected on first run)

**Successful Movie Category Insert:**
```
[DB] Adding movie 123456 to category 'popular'
[DB] Inserted into movie_categories: success=true, changes=1, movieId=123456, category=popular
```
- `changes=1` means the record was inserted
- `changes=0` means INSERT OR IGNORE skipped it (already existed)

**Failed Operations:**
```
[POPULAR] Failed to add movie 123456 (Movie Title) to category: [error details]
```

### Step 4: Common Issues to Look For

1. **Database binding issue**: 
   - If you see errors about `env.plotburn_db` being undefined
   - Check your `wrangler.toml` has the D1 database binding configured

2. **Permission issues**:
   - If operations fail with permission errors
   - Verify the D1 database has the correct schema and permissions

3. **Network/timeout issues**:
   - If operations time out
   - May need to add retry logic or increase worker timeout

4. **Schema mismatch**:
   - If you see "no such table" errors
   - Verify the `movie_categories` table exists in your D1 database

## Expected Behavior After Fix

When you call `/popular` or `/nowPlaying`:

1. **Clear phase**: Should see logs showing existing category records being deleted
2. **Insert phase**: Should see logs for each movie being added to the category
3. **Summary**: Console should show count of saved vs failed movies

Example successful output:
```
[DB] Clearing category 'popular'...
[DB] Cleared category 'popular': success=true, changes=20
[POPULAR] Fetching from TMDB...
[POPULAR] Saving 20 movies to D1...
[DB] Adding movie 123456 to category 'popular'
[DB] Inserted into movie_categories: success=true, changes=1, movieId=123456, category=popular
... (repeated for each movie) ...
[POPULAR] D1 save complete: 20 saved, 0 failed
```

## Next Steps

If issues persist after these changes:

1. **Check database schema**: Verify `movie_categories` table structure
   ```sql
   CREATE TABLE IF NOT EXISTS movie_categories (
       movie_id INTEGER NOT NULL,
       category TEXT NOT NULL,
       added_at INTEGER NOT NULL,
       PRIMARY KEY (movie_id, category),
       FOREIGN KEY (movie_id) REFERENCES movies(id)
   );
   ```

2. **Test database directly**: Try manually inserting/deleting from the table
3. **Check Cloudflare D1 console**: Look for any database-level errors or warnings
4. **Verify worker bindings**: Ensure `wrangler.toml` correctly binds the D1 database

## Additional Notes

- The `INSERT OR IGNORE` statement is intentional - it prevents duplicate entries
- After clearing a category, all subsequent inserts should have `changes=1`
- If you see `changes=0` after clearing, it indicates a timing or transaction issue
- The enhanced logging will remain in place for ongoing monitoring
