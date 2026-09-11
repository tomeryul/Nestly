-- Enforce the stage-0 invariant the UI relies on: a delivery that has no
-- address yet must not carry a return deadline or a collected flag, otherwise
-- its card asks for an address while also counting down (and showing as urgent).
update public.deliveries
set return_by = null, picked_up = false
where stage = 0 and (return_by is not null or picked_up);
