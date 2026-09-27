from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

out = Path(__file__).parent / 'fixtures'
out.mkdir(exist_ok=True)
terms = [
 ('Photosynthesis','the process plants use to convert light into chemical energy'),
 ('Respiration','the process cells use to release energy from nutrients'),
 ('Diffusion','the movement of particles from high to low concentration'),
 ('Osmosis','the movement of water across a selectively permeable membrane'),
 ('Mitosis','cell division that produces two genetically identical cells'),
 ('Meiosis','cell division that produces gametes with half the chromosomes'),
 ('Homeostasis','the maintenance of stable internal conditions'),
 ('An enzyme','a biological catalyst that accelerates a chemical reaction'),
 ('DNA','the molecule that carries hereditary information'),
 ('A gene','a segment of DNA associated with a functional product'),
 ('A chromosome','a structure made of DNA and associated proteins'),
 ('A nucleus','the organelle that contains most DNA in a eukaryotic cell'),
 ('A ribosome','the cellular structure that builds proteins'),
 ('A mitochondrion','an organelle involved in aerobic energy production'),
 ('A chloroplast','the organelle where photosynthesis occurs in plants'),
 ('An ecosystem','a community of organisms interacting with its environment'),
 ('A population','a group of individuals of the same species in an area'),
 ('A habitat','the environment in which an organism lives'),
 ('Biodiversity','the variety of living organisms in an area'),
 ('A producer','an organism that makes organic food from inorganic sources'),
 ('A consumer','an organism that obtains energy by eating other organisms'),
 ('A decomposer','an organism that breaks down dead organic material'),
 ('Natural selection','differential survival and reproduction of inherited variants'),
 ('An adaptation','an inherited trait that improves fitness in a particular environment'),
]
c=canvas.Canvas(str(out/'Biology-course.pdf'),pagesize=A4)
for i,(term,meaning) in enumerate(terms,1):
    c.setFont('Helvetica-Bold',22);c.drawString(48,780,f'Biology / Lesson {i:02d}')
    c.setFont('Helvetica-Bold',17);c.drawString(48,736,term)
    text=c.beginText(48,685);text.setFont('Helvetica',11);text.setLeading(22)
    import textwrap
    for line in textwrap.wrap(f'{term} is {meaning}.',85):text.textLine(line)
    text.textLine('');text.textLine('Study practice includes retrieval, spacing, and reflection.')
    text.textLine('');text.textLine('Compare this concept with the previous lesson in your own words.')
    c.drawText(text);c.setFont('Helvetica',10);c.drawString(48,45,f'Herin verification fixture / page {i} of 24');c.showPage()
c.save()
