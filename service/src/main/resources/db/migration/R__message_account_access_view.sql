DROP VIEW IF EXISTS message_account_access_view;

CREATE VIEW message_account_access_view(employee_id, account_id) AS (
    SELECT employee.id AS employee_id, acc.id AS account_id
    FROM message_account acc
        JOIN employee ON acc.employee_id = employee.id
    WHERE acc.active = TRUE

    UNION

    SELECT acl.employee_id, acc.id as account_id
    FROM message_account acc
        JOIN daycare_group dg ON acc.daycare_group_id = dg.id
        JOIN daycare_acl acl ON acl.daycare_id = dg.daycare_id AND (acl.role = 'UNIT_SUPERVISOR' OR acl.role = 'SPECIAL_EDUCATION_TEACHER')
    WHERE acc.active = TRUE

    UNION

    SELECT gacl.employee_id, acc.id as account_id
    FROM message_account acc
        JOIN daycare_group_acl gacl ON gacl.daycare_group_id = acc.daycare_group_id
    WHERE acc.active = TRUE

    UNION

    SELECT e.id AS employee_id, acc.id AS account_id
    FROM employee e
    JOIN message_account acc ON acc.type = 'MUNICIPAL'
    WHERE e.roles && '{ADMIN, MESSAGING}'::user_role[]
);
