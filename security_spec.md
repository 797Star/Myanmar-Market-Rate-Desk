# Security Specification & Hardening Audit

## 1. Data Invariants
1. **Identity Isolation**: Every user profile (`/users/{userId}`) and all subcollections (`/customRates`, `/priceAlerts`, `/basketQuantities`, `/savedDigests`, `/aiUsage`) are strictly private to the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`).
2. **Master Gate Parent Integrity**: Subcollection writes require the parent `/users/{userId}` document to exist (`exists(/databases/$(database)/documents/users/$(userId))`).
3. **Immutable Ownership & Temporal Integrity**: `uid` / `userId`, `dateKey` (on `aiUsage`), and `createdAt` cannot be modified after creation. `createdAt == request.time` on create; `updatedAt == request.time` on update.
4. **No Shadow Fields**: Every create checks `keys().hasAll(...) && keys().hasOnly(...)`; every update checks `affectedKeys().hasOnly(...)` and invokes `isValid[Entity](incoming())`.
5. **Bounded Strings, Numbers & Arrays**: Every string field enforces `.size() <= maxLength`; numeric counters (`digestCalls`, `searchCalls`) enforce `0 <= val <= 100`; arrays (`keyPointsMm`) enforce `.size() >= 1 && .size() <= 8` and validate `keyPointsMm[0] is string`.
6. **Zero PII Leakage**: No public or blanket-authenticated `list` or `get` on `/users` or subcollections. Every `allow list` on subcollections validates `resource.data.userId == request.auth.uid`. Shared `/townshipReports/{reportId}` contains zero PII (no email/address/phone), restricts `list` to signed-in verified users with bounded query limit (`<= 60`) and timestamp range gate, and binds `reportId == uid + '_' + assetType + '_' + assetId` to cap per-user report volume.
7. **Asset-Specific Numeric Bounds**: `/townshipReports/{reportId}` validates `reportedRate` against tight asset bounds (e.g., USD `1,500–25,000`, Gold 24K `2,000,000–50,000,000`, commodities `500–1,000,000`) directly in Firestore security rules.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: `request.auth == null` reading `/users/u1/customRates/gold-24k` or `/townshipReports/u1_currency_USD` -> DENIED.
2. **Unverified Email**: `request.auth.token.email_verified == false` creating `/users/u1` or `/townshipReports/u1_currency_USD` -> DENIED.
3. **Cross-User Read**: User `u2` reading `/users/u1/priceAlerts/a-1` or `/users/u1/aiUsage/2026-11-23` -> DENIED.
4. **Cross-User List Scraping**: User `u2` listing `/users/u1/customRates` -> DENIED (`resource.data.userId == request.auth.uid` fails).
5. **Identity Spoofing on Create**: User `u1` creating `/users/u1/customRates/usd` or `/townshipReports/u2_currency_USD` with `userId: "u2"` -> DENIED.
6. **Shadow Field Injection**: User `u1` creating `/users/u1` or `/townshipReports/u1_currency_USD` with extra ghost field `isAdmin: true` -> DENIED (`keys().hasOnly(...)` fails).
7. **ID & DateKey Poisoning**: Creating `/users/u1/priceAlerts/${'a'.repeat(500)}` or `/townshipReports/arbitrary_random_id` -> DENIED (`isValidId()` / deterministic ID check fails).
8. **Client-Forged Timestamp**: Creating `/users/u1/customRates/usd` or `/townshipReports/u1_currency_USD` with `createdAt: Timestamp(2020-01-01)` -> DENIED (`createdAt == request.time` fails).
9. **Immutable Field Mutation**: Updating `/users/u1/aiUsage/2026-11-23` or `/townshipReports/u1_currency_USD` while altering `createdAt`, `assetId`, or `userId` -> DENIED.
10. **Denial-of-Wallet String/Rate Overflow**: Creating `/townshipReports/u1_currency_USD` with `reportedRate: 999999999` or `/users/u1/aiUsage/2026-11-23` with `digestCalls: 99999` -> DENIED.
11. **Invalid Enum Value**: Creating `/townshipReports/u1_currency_USD` with `assetType: "crypto"` or `parityCheckStatus: "verified"` -> DENIED.
12. **Orphaned Subcollection / Unregistered Report Write**: Creating `/users/u1/priceAlerts/a1` or `/townshipReports/u1_currency_USD` before `/users/u1` exists -> DENIED (`exists(...)` fails).
