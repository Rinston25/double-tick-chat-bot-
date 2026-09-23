# Zoho CRM Setup

This project talks to Zoho CRM using a **Self Client** OAuth app (server-to-server,
no end-user login flow). Follow these steps once, in order.

## 0. Pick your data center

Zoho accounts live in one of several regional data centers (DCs), and your OAuth
and API calls must go to the DC your org was created in. The defaults in
`.env.example` are for **India (.in)**:

| Data center          | Accounts URL                   | API domain                    |
| -------------------- | ------------------------------ | ----------------------------- |
| India (default here) | `https://accounts.zoho.in`     | `https://www.zohoapis.in`     |
| United States        | `https://accounts.zoho.com`    | `https://www.zohoapis.com`    |
| Europe               | `https://accounts.zoho.eu`     | `https://www.zohoapis.eu`     |
| Australia            | `https://accounts.zoho.com.au` | `https://www.zohoapis.com.au` |

If your Zoho org is not on the India DC, change `ZOHO_ACCOUNTS_URL` and
`ZOHO_API_DOMAIN` in `.env` together (they must match) before continuing.
`ZOHO_API_VERSION` defaults to `v7` and normally does not need to change.

## 1. Create a Self Client

1. Sign in to the [Zoho API Console](https://api-console.zoho.in/) for your DC
   (use the `.com`/`.eu`/`.com.au` equivalent if applicable).
2. Click **Add Client** → **Self Client** → **Create**.
3. On the **Client Secret** tab, copy the **Client ID** and **Client Secret** into
   your `.env`:
   ```
   ZOHO_CLIENT_ID=...
   ZOHO_CLIENT_SECRET=...
   ```

## 2. Generate a grant code and exchange it for a refresh token

1. Still in the Self Client, go to the **Generate Code** tab.
2. Scope: `ZohoCRM.modules.ALL,ZohoCRM.settings.ALL`
3. Time duration: any value (e.g. 10 minutes) — it only needs to live long enough
   for you to run the next command.
4. Description: anything, e.g. "Mahindra AI Chat Agent".
5. Click **Create** and copy the generated grant code.
   **It expires within minutes — do the next step immediately.**
6. From the repo root, exchange it for a refresh token:
   ```bash
   npm run zoho:token -- <paste_grant_code_here>
   ```
   This prints a `ZOHO_REFRESH_TOKEN=...` line — paste it into `.env`. Unlike the
   grant code, the refresh token does not expire (unless you revoke it in the API
   console), so you only need to do this once.

## 3. Add the required custom fields

Every module/field API name used by this project lives in one place:
[`server/src/config/zohoFields.ts`](../server/src/config/zohoFields.ts). If your
CRM already uses different API names, edit that file instead of renaming fields
in Zoho — but the simplest path is to create the fields below exactly as named
(Zoho auto-generates the API name from the field label when you use the same
label, spaces replaced with underscores).

Go to **Setup → Customization → Modules and Fields** for each module below.

### Leads

| Field label          | API name               | Type        | Notes                                 |
| -------------------- | ---------------------- | ----------- | ------------------------------------- |
| Vehicle Model        | `Vehicle_Model`        | Picklist    | Values: `XUV700`, `Thar`, `Scorpio-N` |
| Preferred City       | `Preferred_City`       | Single Line |                                       |
| Test Drive Requested | `Test_Drive_Requested` | Checkbox    |                                       |

Standard fields used (already exist, no action needed): `Last_Name`, `First_Name`,
`Email`, `Phone`, `City`, `Lead_Source`, `Description`.

> **Lead Source**: this app sets `Lead_Source` to the literal value
> `AI Chat Agent`. If your `Lead_Source` picklist is restricted to specific
> values, add `AI Chat Agent` as a valid option (Setup → Modules and Fields →
> Leads → Lead Source → edit picklist values). Otherwise Zoho will reject the
> create with an `INVALID_DATA` error naming this field.

### Deals

| Field label            | API name                 | Type        | Notes                                                 |
| ---------------------- | ------------------------ | ----------- | ----------------------------------------------------- |
| Vehicle Model          | `Vehicle_Model`          | Picklist    | Values: `XUV700`, `Thar`, `Scorpio-N`                 |
| Variant                | `Variant`                | Single Line | e.g. "AX7 L", "LX"                                    |
| Test Drive Date        | `Test_Drive_Date`        | Date/Time   |                                                       |
| Quotation Amount       | `Quotation_Amount`       | Currency    |                                                       |
| Dealer Name            | `Dealer_Name`            | Single Line |                                                       |
| Dealer Phone           | `Dealer_Phone`           | Phone       |                                                       |
| Follow Up Preference   | `Follow_Up_Preference`   | Picklist    | Values: `Call`, `WhatsApp`, `Email`                   |
| Follow Up Time         | `Follow_Up_Time`         | Single Line | Free text, e.g. "weekday evenings"                    |
| Booking ID             | `Booking_ID`             | Single Line | Check **Unique field** — format `MAH-XXXX`            |
| Allocation Status      | `Allocation_Status`      | Picklist    | Values: `Dispatch Pending`, `In Transit`, `Delivered` |
| VIN                    | `VIN`                    | Single Line |                                                       |
| Expected Delivery Date | `Expected_Delivery_Date` | Date        |                                                       |
| Balance Payment Link   | `Balance_Payment_Link`   | URL         |                                                       |

Standard fields used (already exist): `Deal_Name`, `Stage`, `Closing_Date`,
`Amount`, `Contact_Name` (lookup to Contacts), `Description`.

#### About the Stage field — no new pipeline stages needed

The original design called for two dedicated Stage values ("Test Drive
Scheduled" and "Closed Won - Booking Done"). In practice, **`Stage` is a
standard/system field, and most Zoho editions/plans do not allow adding new
picklist values to it** — not from the UI's field editor, the Pipelines
screen, or the Settings API (which only supports picklist updates on
genuinely custom fields). If you hit "the field isn't clickable" or
`INVALID_REQUEST_METHOD` while trying, that's this restriction, not a
mistake on your part.

So this app instead reuses Zoho's **default** pipeline stages:

- `ONGOING_PIPELINE` deals use **any open stage** — the seed script uses
  `Negotiation/Review`, but nothing in the code depends on that exact value.
- `BOOKED_VEHICLE` deals use the default **Closed Won** stage — since every
  Deal in this domain represents a vehicle sale, reaching Closed Won *is*
  the booking.

Both are configured in one place, `server/src/config/zohoFields.ts` →
`DEAL_STAGES`. If your org's plan *does* allow customizing the Stage field,
feel free to add dedicated stages there and update the two values in that
file to match — no other code changes needed.

### Contacts

| Field label         | API name              | Type        | Notes                                   |
| ------------------- | --------------------- | ----------- | --------------------------------------- |
| Registration Number | `Registration_Number` | Single Line | Vehicle registration, e.g. `MH02AB1234` |

Standard fields used (already exist): `First_Name`, `Last_Name`, `Phone`,
`Mobile`, `Email`.

### Cases

| Field label              | API name                   | Type        | Notes                                                                                      |
| ------------------------ | -------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| Registration Number      | `Registration_Number`      | Single Line |                                                                                            |
| Odometer Reading         | `Odometer_Reading`         | Number      | Kilometers                                                                                 |
| Service Type             | `Service_Type`             | Picklist    | Values: `Periodic Maintenance`, `Complaint/Repair`, `Warranty`, `Accident Repair`, `Other` |
| Preferred Service Center | `Preferred_Service_Center` | Single Line |                                                                                            |
| Vehicle Model            | `Vehicle_Model`            | Picklist    | Values: `XUV700`, `Thar`, `Scorpio-N`                                                      |

Standard fields used (already exist): `Subject`, `Status` (must include a
`New` value — the default), `Priority`, `Case_Origin` (must include a `Web`
value — the default), `Description`, `Contact_Name` (lookup to Contacts).

## 4. Seed demo data

Once the fields above exist and `.env` has `ZOHO_REFRESH_TOKEN` set, run:

```bash
npm run seed
```

This is idempotent (it searches before creating), so it's safe to re-run. See
the root [README.md](../README.md) for what it creates and the phone
numbers/IDs to use in the demo.

## Troubleshooting

- **"You are not a part of any CRM service orgs. Please remove the scope to
  generate the token."** (on the Generate Code screen) — the Zoho account
  you're signed into the API console with doesn't have a Zoho CRM
  organization. Three likely causes, in order of likelihood:
  1. You're signed into the wrong Zoho account (if you have more than one,
     switch accounts via the picker in the top-right of the API console to
     the one that actually owns/admins the CRM org).
  2. You're on the wrong data center's console — e.g. your CRM lives at
     `crm.zoho.com` but you opened `api-console.zoho.in`. Open the API
     console on the same DC as your `crm.zoho.*` URL.
  3. You don't have a Zoho CRM org yet at all — sign up for one (a free
     trial is enough) at `crm.zoho.in`/`.com`/`.eu` first, then return to the
     API console and generate the code again.
- **`INVALID_DATA` errors mentioning a field name** — you gave an *existing*
  field a value it won't accept (e.g. a picklist value that isn't in the
  list, or a duplicate value for a field marked unique like `Booking_ID`).
  Fix the value, or add it as a valid picklist option.
- **A record gets created but a custom field value seems to have vanished**
  — this is the more common gotcha, and it does **not** raise an error.
  Zoho's create/update API silently ignores any field key it doesn't
  recognize rather than rejecting the request — so if a custom field from
  [section 3](#3-add-the-required-custom-fields) doesn't exist yet in your
  org, the record still gets created successfully, just without that data.
  Fetch the record back (or open it in the Zoho UI) to confirm the field
  you expect is actually populated before assuming it worked. If it's
  missing, create the field with the exact API name from
  `server/src/config/zohoFields.ts` and **re-create the record** — running
  `npm run seed` again will *not* backfill it, since the script finds the
  existing record by phone/name and skips it rather than re-creating it.
- **401 / `INVALID_TOKEN` on every request** — check `ZOHO_CLIENT_ID` /
  `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` are all from the _same_ Self
  Client and the same data center as `ZOHO_ACCOUNTS_URL`.
- **A newly created record isn't found by a search immediately after** — Zoho's
  search index can lag a few seconds behind writes. The tools in this app
  prefer the record ID already held in session state over re-searching right
  after a create, but if you're testing directly against the Zoho API, allow a
  short delay before searching.
