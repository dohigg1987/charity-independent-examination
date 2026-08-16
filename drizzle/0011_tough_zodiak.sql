ALTER TABLE `engagements` ADD `period_start` text;--> statement-breakpoint
ALTER TABLE `jurisdiction_rule_sets` ADD `effective_date_basis` text DEFAULT 'PERIOD_END' NOT NULL;
--> statement-breakpoint
INSERT INTO `jurisdictions` (`code`,`name`,`regulator`,`regulator_url`,`status`,`updated_by`) VALUES
('ENGLAND_WALES','England and Wales','Charity Commission for England and Wales','https://www.gov.uk/government/organisations/charity-commission','ACTIVE','system-migration'),
('SCOTLAND','Scotland','Office of the Scottish Charity Regulator','https://www.oscr.org.uk/','ACTIVE','system-migration'),
('NORTHERN_IRELAND','Northern Ireland','Charity Commission for Northern Ireland','https://www.charitycommissionni.org.uk/','ACTIVE','system-migration');
--> statement-breakpoint
INSERT INTO `jurisdiction_rule_sets` (`jurisdiction_id`,`version`,`status`,`effective_from`,`effective_to`,`effective_date_basis`,`examination_floor`,`qualification_floor`,`qualification_floor_inclusive`,`audit_income`,`audit_income_inclusive`,`asset_income_floor`,`audit_assets`,`all_charities_scrutinised`,`asset_test_basis`,`notes`,`source_title`,`source_url`,`published_at`,`created_by`,`updated_by`) VALUES
((SELECT `id` FROM `jurisdictions` WHERE `code`='ENGLAND_WALES'),'CCEW-2026.1','PUBLISHED','2009-04-01','2026-09-29','PERIOD_END',25000,250000,0,1000000,0,250000,3260000,0,'INCOME_AND_ASSETS','Independent examination is a limited-assurance scrutiny. Check governing-document, funder, group and regulator overrides.','Independent examination of charity accounts: guidance for trustees (CC31)','https://www.gov.uk/government/publications/independent-examination-of-charity-accounts-trustees-cc31/independent-examination-of-charity-accounts-trustees',CURRENT_TIMESTAMP,'system-migration','system-migration'),
((SELECT `id` FROM `jurisdictions` WHERE `code`='ENGLAND_WALES'),'CCEW-2026.2','PUBLISHED','2026-09-30',NULL,'PERIOD_END',40000,500000,0,1500000,0,500000,5000000,0,'INCOME_AND_ASSETS','Published as a scheduled regime from 30 September 2026. Administrators should verify commencement guidance before first use.','Changes to charity accounting and reporting','https://www.gov.uk/guidance/changes-to-charity-accounting-and-reporting',CURRENT_TIMESTAMP,'system-migration','system-migration'),
((SELECT `id` FROM `jurisdictions` WHERE `code`='SCOTLAND'),'OSCR-2006.2025','PUBLISHED','2006-04-01','2025-12-31','PERIOD_START',0,250000,1,500000,1,0,3260000,1,'ACCRUALS_ASSETS','All Scottish charities require external scrutiny. Audit is also required by overriding law, governing document or funder.','Independent examination: a guide for charity trustees','https://www.oscr.org.uk/managing-a-charity/charity-accounting/external-scrutiny/independent-examination-a-guide-for-charity-trustees/4-when-can-you-have-your-accounts-independently-examined/',CURRENT_TIMESTAMP,'system-migration','system-migration'),
((SELECT `id` FROM `jurisdictions` WHERE `code`='SCOTLAND'),'OSCR-2006.2026','PUBLISHED','2026-01-01',NULL,'PERIOD_START',0,250000,1,1000000,1,0,3260000,1,'ACCRUALS_ASSETS','For periods starting on or after 1 January 2026. All Scottish charities require external scrutiny.','Independent examination: a guide for charity trustees','https://www.oscr.org.uk/managing-a-charity/charity-accounting/external-scrutiny/independent-examination-a-guide-for-charity-trustees/4-when-can-you-have-your-accounts-independently-examined/',CURRENT_TIMESTAMP,'system-migration','system-migration'),
((SELECT `id` FROM `jurisdictions` WHERE `code`='NORTHERN_IRELAND'),'CCNI-2016.1','PUBLISHED','2016-01-01',NULL,'PERIOD_END',0,250000,0,500000,0,0,0,1,'NONE','All registered charities require independent review. Confirm audit, company-law, group and governing-document requirements during acceptance.','Annual reporting guidance','https://www.charitycommissionni.org.uk/manage-your-charity/annual-reporting/',CURRENT_TIMESTAMP,'system-migration','system-migration');
--> statement-breakpoint
INSERT INTO `organisation_types` (`code`,`name`,`status`,`updated_by`) VALUES
('CIO','Charitable incorporated organisation (CIO)','ACTIVE','system-migration'),
('CHARITABLE_COMPANY','Charitable company limited by guarantee','ACTIVE','system-migration'),
('UNINCORPORATED_ASSOCIATION','Unincorporated association','ACTIVE','system-migration'),
('CHARITABLE_TRUST','Charitable trust','ACTIVE','system-migration'),
('ROYAL_CHARTER','Royal charter body','ACTIVE','system-migration'),
('STATUTORY_CHARITY','Statutory charity','ACTIVE','system-migration'),
('COMMUNITY_BENEFIT_SOCIETY','Community benefit society','ACTIVE','system-migration'),
('EXEMPT_CHARITY','Exempt charity','ACTIVE','system-migration'),
('EXCEPTED_CHARITY','Excepted charity','ACTIVE','system-migration');
--> statement-breakpoint
UPDATE `engagements` SET `period_start`=date(`period_end`,'-1 year','+1 day') WHERE `period_start` IS NULL;
--> statement-breakpoint
UPDATE `engagements` SET `jurisdiction_rule_set_id`=(SELECT `id` FROM `jurisdiction_rule_sets` WHERE `version`='CCEW-2026.1') WHERE `jurisdiction`='ENGLAND_WALES' AND `period_end`<'2026-09-30' AND `jurisdiction_rule_set_id` IS NULL;
--> statement-breakpoint
UPDATE `engagements` SET `jurisdiction_rule_set_id`=(SELECT `id` FROM `jurisdiction_rule_sets` WHERE `version`='CCEW-2026.2') WHERE `jurisdiction`='ENGLAND_WALES' AND `period_end`>='2026-09-30' AND `jurisdiction_rule_set_id` IS NULL;
