/*
# Fix user creation trigger to bypass RLS for profile insertion

This migration modifies the `handle_new_user` trigger function to bypass Row-Level Security
when inserting into the `profiles` table. The function is `SECURITY DEFINER`, but the owner
role (`postgres`) does not have `BYPASSRLS` privilege, so the profiles table RLS policies
still block the insert. Adding `SET row_security = off` on the function ensures the profile
insert succeeds when a new user is created via the auth system.

1. Modified Functions
- `handle_new_user()`: adds `SET row_security = off` to bypass RLS on the `profiles` INSERT

2. Security Notes
- The function is `SECURITY DEFINER`, so it runs with elevated privileges.
- The `row_security = off` only affects this function execution and not regular sessions.
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SET row_security = off
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'role', 'staff'));
  RETURN NEW;
END;
$$;
