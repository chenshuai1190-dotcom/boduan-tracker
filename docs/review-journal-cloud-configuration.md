# Review journal cloud configuration

## Authorized scope

2026-11-06: user authorized configuration in the signed-in Supabase dashboard. Target project was matched to the local application's Supabase URL before any write. Configuration is additive, private, and limited to review metadata and image attachments.

## Preflight

- `disciplines`: 10 rows; UUID primary key; existing owner-only authenticated ALL policy; RLS enabled.
- `review_logs`: 25 rows; UUID primary key; existing owner-only authenticated ALL policy; RLS enabled.
- Both have `updated_at timestamptz`; neither has `review_data` or `review_revision` yet.
- No existing triggers on either table. No other permissive policies on either table.
- `storage.objects` has RLS enabled and no existing policies.
- `review-journal-images` bucket does not exist; no objects use that bucket ID.
- No user contents, identities, or credentials were exported. Checks are schema metadata and aggregate counts only.

## Execution and recovery

Apply `supabase/review-journal.sql` as one transaction. On any SQL failure PostgreSQL rolls back the transaction. Existing primary keys and text/date columns remain unchanged; old application writes remain supported. No historical row movement, deletion, or trading-ledger mutation.

After success, preserve this additive schema if the frontend needs to be rolled back. Fix forward; do not remove user images or rich metadata and do not relax RLS. Verify unchanged row counts, default empty metadata/revision, private bucket, MIME/size limits, indexes, triggers, and owner-only policies.

## Local SQL verification

`tests/review-journal-migration.test.js` passed 9/9 checks using offline PGlite: repeatability, old writes, revision CAS, operation identity, owner/anonymous isolation, and Storage path policies. Auth and Storage functions are fixtures; this is not a substitute for a real HTTP upload and signed-image read.

## Cloud result

Review migration applied successfully through the signed-in dashboard. Postflight: 4 new columns, 2 unique operation indexes, 2 revision triggers; all 10 discipline rows and 25 review-log rows retain empty metadata and revision 0. Private bucket is 10 MiB with JPEG/PNG/WebP, with exactly four bucket-scoped owner policies. Real signed-in local application uploaded one application-logo image and saved a clearly labelled verification record; signed image decoded at 1024×1024, survived a full browser reload, and opened in the image viewer. Following the user's explicit cleanup confirmation, the application deleted the test record and attachment.

## Custom avatar addition

User separately authorized custom-avatar upload on 2026-11-06. Preflight: `community_profiles` has 13 rows, no `avatar_path`; existing columns are user_id/nickname/avatar_key/created_at/updated_at/profile_completed_at. SELECT, INSERT, UPDATE policies are owner-only (`auth.uid() = user_id`); no extra profile policies. `community-avatars` does not exist. All existing Storage policies are limited to the new review bucket.

Apply independent `supabase/community-profile-avatar.sql` transaction: nullable owner-scoped path, keep preset fallback, private 2 MiB JPEG/PNG/WebP bucket. Preserve profile policies and old client compatibility. Recovery is additive forward-fix, never deleting original profile data or relaxing access. Local SQL verification passed 4/4 with PGlite fixtures.

Avatar migration applied successfully. All 13 profiles retained null avatar paths immediately afterward; the three original profile policies were unchanged. Real signed-in application test: choose the existing fox sample asset, crop locally, save, decode a private signed 512×512 image, reload, then verify all 36 avatar instances on the review page used the saved custom image. Following explicit user authorization, restore the original fox preset and remove the uploaded test object. No new portrait or permanent profile change was left behind.

## Final validation and boundaries

- Production transaction-scoped RLS assertions passed: actual image owner can read, a different authenticated identity cannot read review/profile/image records, anonymous cannot read private images. Identity settings were rolled back. This is a database-role check, not a second real browser account login.
- Final cloud assertions all true: 10 discipline + 25 review-log records preserved; 13 profiles restored; zero objects in the two new buckets; both buckets private; eight bucket-specific owner policies; three original profile policies retained.
- Full gate: `PGLITE_MODULE_FILE=/tmp/review-journal-pglite.yqYlGy/node_modules/@electric-sql/pglite/dist/index.js npm run check:full` passed: 3,352 tests, zero failed/skipped, build, docs consistency and whitespace. Log: `/tmp/quote-review-images-avatar-full-check.log`.
- Phone-size browser UI verified at 390×844. Screenshots under `artifacts/review-cloud-configuration/`; viewport override was temporary. No PWA lifecycle/realtime changes made.
- These are pre-release cloud-configuration results. Cloud migrations are live; the user subsequently authorized the v10.7.9.567 frontend/server release. Use the exact release commit's CI, Vercel and task conclusion for final deployment status. Community leaderboard signing and P&L Canvas integration passed targeted tests but were not separately exercised against the production API during configuration.
- Release preflight: Vercel project Checks API returned an empty configured-check list. Repository audit/build gates remain enabled; the release waiter must confirm exact-commit CI and Vercel success. Do not claim remote CI promotion protection is configured.
- Native iPhone 17 Pro / iOS 26.5 Safari Settings preview captured as original 1206×2622 PNG (`artifacts/review-cloud-configuration/settings-iphone-native3x.png`). Crop-dialog interactions were verified in the phone-sized browser; native coordinate interaction was unavailable for that dialog. Earlier native journal/replay evidence is recorded in the integration note.
- Existing users' journal contents and financial data were not changed. Only explicitly labelled verification content and a reversible avatar setting were created for end-to-end testing, then cleaned up.
