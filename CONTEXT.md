# Home Catalogue

An offline-capable PWA tracking what the Household has, is running low on, or is out of, and
exporting shopping trips to Google Calendar. Stores its data on the data platform
([nadav-alon/data-platform](https://github.com/nadav-alon/data-platform)). Decided on
[Catalogue domain model](https://github.com/nadav-alon/side-projects-manager/issues/916).

## Language

**Item**:
A generic product (not a brand), with an optional brand note. Has one Category, one Necessity, one
State. Its Shop comes from its Category, overridable per Item. A platform Core entity.

**Barcode**:
A GTIN (8, 12, 13 or 14 digits, no check-digit validation) read from a scan, never typed in.
An Item carries any number of them; the same one may sit on several Items.

**Category**:
User-defined, flat grouping of Items. Carries a default Shop.
_Avoid_: aisle, tag

**Shop**:
A kind of place (pharmacy, grocery), not a specific store. One per Item in the POC.
_Avoid_: store, supermarket

**State**:
`enough` / `running low` / `out`. Set manually only.
_Avoid_: have / almost gone / need

**State history**:
Every State change, timestamped, append-only.

**Necessity**:
`essential` / `important` / `optional`. Drives Alerts only.
_Avoid_: priority

**Alert**:
A level from Necessity × State: **now** ("urgent" in banner copy; red banner, same-day reminder on
the exported event) or **soon** (yellow banner).

| Necessity \ State | enough | running low | out     |
| ----------------- | ------ | ----------- | ------- |
| essential         | —      | **now**     | **now** |
| important         | —      | **soon**    | **now** |
| optional          | —      | —           | **soon**|

**Shopping list**:
Live view of every Item at `running low` or `out`, grouped by Shop, `running low` flagged
optional. Ticking an Item sets it `enough`. Canonical; works offline.

**Export**:
One tap creating one Google Calendar event per Shop with pending Items, list in the description,
on a picked date. A read-only copy of the Shopping list.
