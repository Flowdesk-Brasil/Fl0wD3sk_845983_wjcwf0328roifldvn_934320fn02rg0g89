create unique index if not exists idx_push_subscriptions_endpoint
  on push_subscriptions (endpoint);

create index if not exists idx_push_subscriptions_user_id
  on push_subscriptions (user_id);
