const jsPdf = require('jspdf')
const fs = require('fs')
const html2image = require('html-to-image')

async function test() {
	const pdf = new jsPdf.jsPDF()
	const html = fs.readFileSync('test.html', 'utf8')
	const image = await html2image.toPng(html)
	pdf.addImage(image, 'PNG', 0, 0)

	pdf.save('test.pdf')
}

test()