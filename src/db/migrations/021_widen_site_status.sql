-- Widen generated_sites.status from VARCHAR(20) to VARCHAR(64).
--
-- Reason: the original column couldn't hold 'domain_setup_complete' (21
-- chars), causing every successful domain-purchase write to throw and be
-- swallowed by the outer catch in postPayment.js. Customers got a
-- "manual setup" recovery message instead of the success message, the
-- status stayed at 'domain_setup_pending', and the domain-verifier job
-- (which queries for 'domain_setup_complete') never found anyone.
ALTER TABLE generated_sites ALTER COLUMN status TYPE VARCHAR(64);
