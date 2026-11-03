-- A client billed a fixed amount per invoice instead of by the hour; NULL = hourly (its rate). Additive: no existing row changes.
ALTER TABLE clients ADD COLUMN fixed_fee REAL;
