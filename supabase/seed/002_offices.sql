-- MARREG :: starter Marriage Officer directory
--
-- IMPORTANT: this is a STRUCTURAL seed, not the official directory.
-- One office per district plus the main sub-divisional offices, so that
-- office search and the application flow work end to end. Officer names,
-- phone numbers, and email addresses are deliberately left NULL — do not
-- present them as official until the real directory has been imported with
-- scripts/import-offices.ts.

insert into offices (office_code, name, district_code, sub_division, police_station, address, pincode, acts) values
('WB-ALP-MO-01','Office of the Marriage Officer, Alipurduar','WB-ALP',NULL,'Alipurduar','District Registry Office, Alipurduar, Alipurduar, West Bengal','736121','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-BAN-MO-02','Office of the Marriage Officer, Bankura','WB-BAN',NULL,'Bankura','District Registry Office, Bankura, Bankura, West Bengal','722101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-BIR-MO-03','Office of the Marriage Officer, Birbhum','WB-BIR',NULL,'Suri','District Registry Office, Suri, Birbhum, West Bengal','731101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-COB-MO-04','Office of the Marriage Officer, Cooch Behar','WB-COB',NULL,'Cooch Behar','District Registry Office, Cooch Behar, Cooch Behar, West Bengal','736101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-DDJ-MO-05','Office of the Marriage Officer, Dakshin Dinajpur','WB-DDJ',NULL,'Balurghat','District Registry Office, Balurghat, Dakshin Dinajpur, West Bengal','733101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-DAR-MO-06','Office of the Marriage Officer, Darjeeling','WB-DAR',NULL,'Darjeeling','District Registry Office, Darjeeling, Darjeeling, West Bengal','734101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-HOO-MO-07','Office of the Marriage Officer, Hooghly','WB-HOO',NULL,'Chinsurah','District Registry Office, Chinsurah, Hooghly, West Bengal','712101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-HOW-MO-08','Office of the Marriage Officer, Howrah','WB-HOW',NULL,'Howrah','District Registry Office, Howrah, Howrah, West Bengal','711101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-JAL-MO-09','Office of the Marriage Officer, Jalpaiguri','WB-JAL',NULL,'Jalpaiguri','District Registry Office, Jalpaiguri, Jalpaiguri, West Bengal','735101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-JHA-MO-10','Office of the Marriage Officer, Jhargram','WB-JHA',NULL,'Jhargram','District Registry Office, Jhargram, Jhargram, West Bengal','721507','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-KAL-MO-11','Office of the Marriage Officer, Kalimpong','WB-KAL',NULL,'Kalimpong','District Registry Office, Kalimpong, Kalimpong, West Bengal','734301','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-KOL-MO-12','Office of the Marriage Officer, Kolkata','WB-KOL',NULL,'Kolkata','District Registry Office, Kolkata, Kolkata, West Bengal','700001','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-MAL-MO-13','Office of the Marriage Officer, Malda','WB-MAL',NULL,'English Bazar','District Registry Office, English Bazar, Malda, West Bengal','732101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-MUR-MO-14','Office of the Marriage Officer, Murshidabad','WB-MUR',NULL,'Berhampore','District Registry Office, Berhampore, Murshidabad, West Bengal','742101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-NAD-MO-15','Office of the Marriage Officer, Nadia','WB-NAD',NULL,'Krishnanagar','District Registry Office, Krishnanagar, Nadia, West Bengal','741101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-N24-MO-16','Office of the Marriage Officer, North 24 Parganas','WB-N24',NULL,'Barasat','District Registry Office, Barasat, North 24 Parganas, West Bengal','700124','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-PBA-MO-17','Office of the Marriage Officer, Paschim Bardhaman','WB-PBA',NULL,'Asansol','District Registry Office, Asansol, Paschim Bardhaman, West Bengal','713301','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-PME-MO-18','Office of the Marriage Officer, Paschim Medinipur','WB-PME',NULL,'Medinipur','District Registry Office, Medinipur, Paschim Medinipur, West Bengal','721101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-PUB-MO-19','Office of the Marriage Officer, Purba Bardhaman','WB-PUB',NULL,'Bardhaman','District Registry Office, Bardhaman, Purba Bardhaman, West Bengal','713101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-PMD-MO-20','Office of the Marriage Officer, Purba Medinipur','WB-PMD',NULL,'Tamluk','District Registry Office, Tamluk, Purba Medinipur, West Bengal','721636','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-PUR-MO-21','Office of the Marriage Officer, Purulia','WB-PUR',NULL,'Purulia','District Registry Office, Purulia, Purulia, West Bengal','723101','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-S24-MO-22','Office of the Marriage Officer, South 24 Parganas','WB-S24',NULL,'Alipore','District Registry Office, Alipore, South 24 Parganas, West Bengal','700027','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-UDJ-MO-23','Office of the Marriage Officer, Uttar Dinajpur','WB-UDJ',NULL,'Raiganj','District Registry Office, Raiganj, Uttar Dinajpur, West Bengal','733134','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-KOL-MO-S01','Office of the Marriage Officer, Kolkata North','WB-KOL','Kolkata North','Shyambazar','Sub-Divisional Registry Office, Kolkata North, West Bengal','700004','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-KOL-MO-S02','Office of the Marriage Officer, Kolkata South','WB-KOL','Kolkata South','Bhowanipore','Sub-Divisional Registry Office, Kolkata South, West Bengal','700025','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-N24-MO-S03','Office of the Marriage Officer, Barrackpore','WB-N24','Barrackpore','Barrackpore','Sub-Divisional Registry Office, Barrackpore, West Bengal','700120','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-N24-MO-S04','Office of the Marriage Officer, Bidhannagar','WB-N24','Bidhannagar','Bidhannagar','Sub-Divisional Registry Office, Bidhannagar, West Bengal','700091','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-S24-MO-S05','Office of the Marriage Officer, Baruipur','WB-S24','Baruipur','Baruipur','Sub-Divisional Registry Office, Baruipur, West Bengal','700144','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-S24-MO-S06','Office of the Marriage Officer, Diamond Harbour','WB-S24','Diamond Harbour','Diamond Harbour','Sub-Divisional Registry Office, Diamond Harbour, West Bengal','743331','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-HOO-MO-S07','Office of the Marriage Officer, Serampore','WB-HOO','Serampore','Serampore','Sub-Divisional Registry Office, Serampore, West Bengal','712201','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-HOW-MO-S08','Office of the Marriage Officer, Uluberia','WB-HOW','Uluberia','Uluberia','Sub-Divisional Registry Office, Uluberia, West Bengal','711315','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-DAR-MO-S09','Office of the Marriage Officer, Siliguri','WB-DAR','Siliguri','Siliguri','Sub-Divisional Registry Office, Siliguri, West Bengal','734001','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}'),
('WB-PBA-MO-S10','Office of the Marriage Officer, Durgapur','WB-PBA','Durgapur','Durgapur','Sub-Divisional Registry Office, Durgapur, West Bengal','713201','{HMA_1955,SMA_13,SMA_16,ICMA_1872,PMDA_1936}')
on conflict (office_code) do update set
  name = excluded.name,
  district_code = excluded.district_code,
  sub_division = excluded.sub_division,
  police_station = excluded.police_station,
  address = excluded.address,
  pincode = excluded.pincode,
  acts = excluded.acts;
