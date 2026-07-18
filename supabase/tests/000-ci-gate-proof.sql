-- Deliberately failing test: exists ONLY to prove the CI pgTAP gate bites (W0.6 done
-- check, docs/spec/25). Reverted in the next commit once the red run is recorded.
begin;
select plan(1);
select ok(false, 'CI gate proof: this failure is intentional and temporary');
select * from finish();
rollback;
