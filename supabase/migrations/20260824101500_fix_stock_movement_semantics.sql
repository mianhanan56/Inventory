/*
# Fix stock movement semantics and stop stock going negative

1. `update_product_stock()`: a `return` movement now ADDS stock back instead of
   subtracting it. The original trigger grouped `return` with `out`
   (`IN ('out', 'return')`), so recording a customer return deducted the returned
   quantity a second time — the goods came back on the shelf and the system took
   them off it again.

2. `products.current_stock >= 0` CHECK constraint. The POS wrote an absolute
   stock value clamped with `Math.max(0, ...)`, which turned an oversell into a
   silent zero. With the client no longer writing that absolute value (the
   trigger owns stock now), an oversell would drive the column negative instead.
   The constraint makes it fail loudly at the `stock_movements` insert, which
   aborts the whole statement, so no sale can quietly consume stock that is not
   there.

   Added NOT VALID: any row already driven negative by the two bugs above stays
   as it is rather than blocking the migration, but every subsequent write to
   `products` — including the trigger's — is checked. Existing negative rows are
   corrected by the next stock-in or adjustment.
*/

CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- 'return' is stock coming back from a customer, so it moves the same
  -- direction as 'in'. 'adjustment' sets an absolute count (a stocktake).
  IF NEW.type IN ('in', 'return') THEN
    UPDATE products SET current_stock = current_stock + NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  ELSIF NEW.type = 'out' THEN
    UPDATE products SET current_stock = current_stock - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  ELSIF NEW.type = 'adjustment' THEN
    UPDATE products SET current_stock = NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE products
  ADD CONSTRAINT products_current_stock_non_negative
  CHECK (current_stock >= 0) NOT VALID;
