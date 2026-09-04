-- ---------------------------------------------------------------------------
-- Bind a chat session to the browser that started it.
--
-- Session ids travel in the request body, so before this change any caller who
-- guessed or observed an id could append turns to someone else's conversation.
-- With server-rebuilt history that is worse than untidy: injected turns become
-- part of what the model is shown on the victim's next question.
--
-- `owner_token` is a server-generated secret delivered to the browser in an
-- HttpOnly cookie. It is claimed by the first request that creates the session
-- and checked on every request afterwards. This is ownership, not identity: it
-- proves the same browser is continuing its own conversation, and it makes no
-- claim about who that browser belongs to. Real authentication is a later
-- concern; this closes the cross-user write without pretending to be more.
--
-- Nullable because rows written before this migration have no owner. Those
-- sessions stay readable and are treated as unclaimed by the application, which
-- is the honest state for a row whose owner was never recorded.
-- ---------------------------------------------------------------------------

alter table chat_sessions
  add column if not exists owner_token text;

alter table chat_sessions
  drop constraint if exists chat_sessions_owner_token_length;

-- Rejects a token too short to be unguessable, without prescribing a format.
alter table chat_sessions
  add constraint chat_sessions_owner_token_length
  check (owner_token is null or length(owner_token) >= 32);
