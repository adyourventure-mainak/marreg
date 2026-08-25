-- MARREG :: reference data (districts, fees)
-- Districts are the 23 real districts of West Bengal.

insert into districts (code, name, name_bn, division) values
 ('WB-ALP','Alipurduar','আলিপুরদুয়ার','Jalpaiguri'),
 ('WB-BAN','Bankura','বাঁকুড়া','Medinipur'),
 ('WB-BIR','Birbhum','বীরভূম','Burdwan'),
 ('WB-COB','Cooch Behar','কোচবিহার','Jalpaiguri'),
 ('WB-DDJ','Dakshin Dinajpur','দক্ষিণ দিনাজপুর','Malda'),
 ('WB-DAR','Darjeeling','দার্জিলিং','Jalpaiguri'),
 ('WB-HOO','Hooghly','হুগলি','Burdwan'),
 ('WB-HOW','Howrah','হাওড়া','Presidency'),
 ('WB-JAL','Jalpaiguri','জলপাইগুড়ি','Jalpaiguri'),
 ('WB-JHA','Jhargram','ঝাড়গ্রাম','Medinipur'),
 ('WB-KAL','Kalimpong','কালিম্পং','Jalpaiguri'),
 ('WB-KOL','Kolkata','কলকাতা','Presidency'),
 ('WB-MAL','Malda','মালদা','Malda'),
 ('WB-MUR','Murshidabad','মুর্শিদাবাদ','Presidency'),
 ('WB-NAD','Nadia','নদিয়া','Presidency'),
 ('WB-N24','North 24 Parganas','উত্তর ২৪ পরগনা','Presidency'),
 ('WB-PBA','Paschim Bardhaman','পশ্চিম বর্ধমান','Burdwan'),
 ('WB-PME','Paschim Medinipur','পশ্চিম মেদিনীপুর','Medinipur'),
 ('WB-PUB','Purba Bardhaman','পূর্ব বর্ধমান','Burdwan'),
 ('WB-PMD','Purba Medinipur','পূর্ব মেদিনীপুর','Medinipur'),
 ('WB-PUR','Purulia','পুরুলিয়া','Medinipur'),
 ('WB-S24','South 24 Parganas','দক্ষিণ ২৪ পরগনা','Presidency'),
 ('WB-UDJ','Uttar Dinajpur','উত্তর দিনাজপুর','Malda')
on conflict (code) do update set name = excluded.name, name_bn = excluded.name_bn, division = excluded.division;

-- Indicative fee schedule. Replace amounts with the current gazette values before go-live.
insert into fee_schedule (purpose, act_code, amount, gazette_reference) values
 ('Application for registration', 'HMA_1955', 200.00, 'Pending verification'),
 ('Notice of intended marriage', 'SMA_13',   300.00, 'Pending verification'),
 ('Application for registration', 'SMA_16',  300.00, 'Pending verification'),
 ('Application for registration', 'ICMA_1872', 250.00, 'Pending verification'),
 ('Application for registration', 'PMDA_1936', 250.00, 'Pending verification'),
 ('Certified copy of certificate', null,     100.00, 'Pending verification'),
 ('Search of marriage records', null,         50.00, 'Pending verification')
on conflict do nothing;
