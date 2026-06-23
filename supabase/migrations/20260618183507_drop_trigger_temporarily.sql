/*
# Temporarily drop and recreate handle_new_user trigger

1. Drop the trigger trg_handle_new_user to allow user creation without the profile insert
2. The edge function will create the user via admin API, then insert the profile separately
*/

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
