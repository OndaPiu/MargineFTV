"""Exercise extraction using synthetic PDF rows, never private supplier prices."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from reportlab.pdfgen import canvas
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('extract',ROOT/'scripts/extract-procurement-catalog.py')
extract=importlib.util.module_from_spec(spec);spec.loader.exec_module(extract)
FIXTURE={
 3:['Prezzo Lordo','INVERTER-DEMO Wi-Fi 200,00€','Inverter monofase 6 kW'],
 5:['Prezzo Lordo','WALLBOX-DEMO 300,00€','Monofase 7 kW'],
 7:['Prezzo Netto','INVERTER-NETTO-DEMO 125,00€','Inverter monofase 3 kW'],
 15:['Prezzo Lordo','WALLBOX-DEMO 400,00€'],
 25:['Prezzo Lordo','CAVO-DEMO 1,21€'],
 29:['Prezzo Lordo','CCI-DEMO 1.000,00€','Prezzo Netto','SERVIZIO-DEMO 80,00€'],
 33:['Prezzo Netto','Prima accensione DEMO 50,00€'],
 38:['Prezzo Lordo','SOLARE-DEMO 300,00€ 1.200,00€','SOLARE-AMBIGUO 300,00€ 1.234.00€']}
class ExtractionTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory()
  file=Path(cls.temp.name)/'synthetic.pdf';pdf=canvas.Canvas(str(file))
  for page in range(1,39):
   y=800
   for line in FIXTURE.get(page,[]):pdf.drawString(40,y,line);y-=20
   pdf.showPage()
  pdf.save();cls.offers,cls.audit=extract.extract(file)
 @classmethod
 def tearDownClass(cls):cls.temp.cleanup()
 def find(self,label,page=None):
  return next(o for o in self.offers if o['label']==label and (page is None or o['page']==page))
 def test_all_detected_price_rows_have_offers(self):
  self.assertEqual(len(self.audit),10)
  self.assertEqual(len({o['id'] for o in self.offers}),len(self.offers))
 def test_discounts_and_net_prices(self):
  self.assertEqual(self.find('INVERTER-DEMO Wi-Fi')['purchasePriceCents'],10000)
  self.assertEqual(self.find('INVERTER-NETTO-DEMO')['purchasePriceCents'],12500)
  self.assertEqual(self.find('Prima accensione DEMO')['purchasePriceCents'],5000)
 def test_mixed_gross_and_net_on_same_page(self):
  self.assertEqual(self.find('CCI-DEMO')['discountPercent'],50)
  self.assertEqual(self.find('SERVIZIO-DEMO')['discountPercent'],0)
 def test_conflicting_rows_are_retained(self):
  a=self.find('WALLBOX-DEMO',5);b=self.find('WALLBOX-DEMO',15)
  self.assertEqual(a['purchasePriceCents'],15000)
  self.assertEqual(b['purchasePriceCents'],20000)
  self.assertTrue(any('discordanti' in r for r in a['review']))
 def test_thermal_incentives_are_not_purchase_prices(self):
  item=self.find('SOLARE-DEMO')
  self.assertEqual(item['purchasePriceCents'],60000)
  self.assertEqual(item['incentiveRaw'],'300,00€')
 def test_ambiguous_prices_remain_unpriced(self):
  self.assertIsNone(self.find('SOLARE-AMBIGUO')['purchasePriceCents'])
 def test_fractional_cents_are_not_rounded_per_unit(self):
  self.assertEqual(self.find('CAVO-DEMO')['purchasePriceCents'],60.5)
if __name__=='__main__':unittest.main()
