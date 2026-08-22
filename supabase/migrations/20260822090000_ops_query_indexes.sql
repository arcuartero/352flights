create index if not exists price_snapshots_scanned_at_id_idx
  on public.price_snapshots (scanned_at desc, id desc);

create index if not exists deal_candidates_editorial_queue_idx
  on public.deal_candidates (status, score desc, created_at desc)
  where drop_ratio <= 0.85;

create index if not exists price_snapshots_route_pattern_scanned_idx
  on public.price_snapshots (
    route_id,
    (metadata ->> 'pattern_key'),
    scanned_at desc,
    id desc
  );
