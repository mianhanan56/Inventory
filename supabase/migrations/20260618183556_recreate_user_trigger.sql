/*
# Recreate handle_new_user trigger with RLS bypass

1. Recreate the trigger trg_handle_new_user on auth.users
2. The handle_new_user function already has SET row_security = off from the earlier migration
3. This trigger auto-creates a profile when a new user is created via Supabase Auth
*/

CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
