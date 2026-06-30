-- Deletes old price snapshots created before the timing-aware scanner update.
-- Safe rule:
-- - keep only rows that have return_date
-- - and have all timing + stay metadata keys present
-- deal_candidates tied to these snapshots are deleted automatically via cascade.

delete from public.price_snapshots
where return_date is null
   or not (
     metadata ?& array[
       'outbound_departure_at',
       'outbound_arrival_at',
       'return_departure_at',
       'return_arrival_at',
       'destination_stay_hours'
     ]
   );
