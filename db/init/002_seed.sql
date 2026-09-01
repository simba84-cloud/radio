insert into stations (slug, name, stream_url) values
  ('bbc-r6',   'BBC Radio 6 Music', 'https://example.invalid/r6'),
  ('kexp',     'KEXP 90.3 FM',      'https://example.invalid/kexp'),
  ('nts-1',    'NTS Radio 1',       'https://example.invalid/nts1')
on conflict (slug) do nothing;
