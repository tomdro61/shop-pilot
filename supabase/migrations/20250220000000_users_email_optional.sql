-- Make email optional on users table (techs may not have one)
alter table users alter column email drop not null;
alter table users drop constraint users_email_key;
