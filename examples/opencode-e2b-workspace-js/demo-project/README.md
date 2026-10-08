# invoicer

Small invoicing library used by the billing service. Work in progress.

## Status

- [x] Line items and totals (`src/invoice.ts`)
- [x] Tax by country (`src/tax.ts`)
- [ ] Volume discounts (`src/discounts.ts`) — implemented, but the test for the
      threshold case is red; not sure whether the spec means "10 or more" or "more than 10".
- [ ] Currency formatting for EUR/GBP (`src/format.ts`) — USD only for now
- [ ] Credit notes

## Spec notes

Volume discount: an order line with **at least 10 units** gets 10% off that line.
Tax is applied after discounts.
