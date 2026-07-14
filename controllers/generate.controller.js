import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import SVGtoPDF from 'svg-to-pdfkit';
import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templateCacheDir = path.join(__dirname, '..', 'cache', 'templates');
const fontCacheDir = path.join(__dirname, '..', 'cache', 'fonts');

[templateCacheDir, fontCacheDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Extract font properties from SVG
function extractFontPropertiesFromSVG(svg, fontFamily) {
  const pNameTextMatch = svg.match(
    /<text[^>]+fill="#339DDC"[^>]*>[\s\S]*?<tspan[^>]*>\{p_name\}<\/tspan>[\s\S]*?<\/text>/
  );
  const textElement = pNameTextMatch[0];

  const fontSizeMatch = textElement.match(/font-size=['"]([^'"]+)['"]/);
  const fontWeightMatch = textElement.match(/font-weight=['"]([^'"]+)['"]/);

  return {
    fontSize: parseFloat(fontSizeMatch[1]),
    fontWeight: fontWeightMatch[1],
    fontFamily: fontFamily,
  };
}

// Measure text width using PDFKit
function measureTextWidth(text, fontSize, fontPath) {
  const doc = new PDFDocument();
  doc.registerFont('NameFont', fontPath);
  doc.font('NameFont').fontSize(fontSize);

  const width = doc.widthOfString(text);
  return width;
}

// Get template info from Supabase
async function getTemplateInfoFromSupabase(cType, cName = null) {
  let query = supabase
    .from('certificate_templates')
    .select('*')
    .eq('c_type', cType);

  if (cName) {
    query = query.eq('c_name', cName);
  }

  const { data, error } = await query.single();

  if (error || !data) throw new Error('Template not found in Supabase!');
  return data;
}

// Get font files from Supabase
async function getFontFromSupabase(templateInfo) {
  const fonts = [
    { path: templateInfo.main_font_path },
    { path: templateInfo.name_font_path }
  ];

  for (const font of fonts) {
    const filename = path.basename(font.path);
    const localPath = path.join(fontCacheDir, filename);

    if (!fs.existsSync(localPath)) {
      const { data, error } = await supabase.storage
        .from('certificate-fonts')
        .download(font.path);

      if (error) throw new Error(`Failed to download font from Supabase Storage: ${font.path}`);

      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
    }
  }
}

// Get SVG template from Supabase
async function getTemplateSVG(templateInfo) {
  const filename = path.basename(templateInfo.svg_path);
  const localPath = path.join(templateCacheDir, filename);

  if (!fs.existsSync(localPath)) {
    const { data, error } = await supabase.storage
      .from('certificate-templates')
      .download(templateInfo.svg_path);

    if (error) throw new Error(`Failed to download SVG from Supabase Storage: ${templateInfo.svg_path}`);

    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
  }

  return fs.readFileSync(localPath, 'utf8');
}

const positionMap = {
  1: 'First Prize',
  2: 'Second Prize',
  3: 'Third Prize'
};

async function generateCertificateBuffer(pName, eName, cType, position = null, cName = null) {
  const templateInfo = await getTemplateInfoFromSupabase(cType, cName);
  await getFontFromSupabase(templateInfo);
  const svg = await getTemplateSVG(templateInfo);

  const fontFileName = path.basename(templateInfo.main_font_path, path.extname(templateInfo.main_font_path));
  const fontProps = extractFontPropertiesFromSVG(svg, fontFileName);
  const nameFontPath = path.join(fontCacheDir, path.basename(templateInfo.name_font_path));
  const actualTextWidth = measureTextWidth(pName, fontProps.fontSize, nameFontPath);
  const totalWidth = actualTextWidth;
  const maxWidth = templateInfo.constraints.max_width;

  if (totalWidth > maxWidth) {
    return Promise.reject(
      new Error(
        `Name '${pName}' is too long (${Math.round(totalWidth)}px). Maximum width allowed is ${maxWidth}px.`
      )
    );
  }

  const pdfFontPath = path.join(__dirname, '..', 'cache', 'fonts', templateInfo.main_font_path);

  let posText = '';
  if (position !== null) {
    posText = positionMap[position];
    if (!posText) return Promise.reject(new Error('Invalid position value!'));
  }

  let svgProcessed = svg
    .replace(/{p_name}/g, pName)
    .replace(/{e_name}/g, eName)
    .replace(/{c_type}/g, cType === 1 ? 'Appreciation' : 'Participation')
    .replace(/{pos}/g, posText);

  const doc = new PDFDocument({
    size: (svg.match(/<svg[^>]*width=["']?([\d.]+)["'][^>]*height=["']?([\d.]+)["']/i) || []).slice(1).map(Number),
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  const fontName = fontFileName;
  svgProcessed = svgProcessed.replace(
    /font-family=['"][^'"]*['"]/g,
    `font-family='${fontName}'`
  );
  doc.registerFont(`${fontName}.ttf`, pdfFontPath);

  let buffers = [];
  doc.on('data', buffers.push.bind(buffers));

  SVGtoPDF(doc, svgProcessed, 0, 0, {
    preserveAspectRatio: "xMinYMin meet"
  });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
    doc.on('error', reject);
  });
}

// Clear template and font caches
function clearCache() {
  if (fs.existsSync(templateCacheDir)) {
    fs.readdirSync(templateCacheDir).forEach(file => {
      fs.unlinkSync(path.join(templateCacheDir, file));
    });
  }

  if (fs.existsSync(fontCacheDir)) {
    fs.readdirSync(fontCacheDir).forEach(file => {
      fs.unlinkSync(path.join(fontCacheDir, file));
    });
  }
}

export { generateCertificateBuffer, clearCache };
