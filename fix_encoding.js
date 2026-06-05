const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.next')) { 
      results = results.concat(walk(file));
    } else if (stat && !stat.isDirectory()) { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
    }
  });
  return results;
}
const files = walk('src');
let count = 0;
const replacements = {
  'Ã§Ã£o': 'ção',
  'Ã§Ãµes': 'ções',
  'Ã§': 'ç',
  'Ã£': 'ã',
  'Ã¡': 'á',
  'Ã©': 'é',
  'Ã³': 'ó',
  'Ãº': 'ú',
  'Ã­': 'í',
  'Ãª': 'ê',
  'Ã¢': 'â',
  'Ãµ': 'õ',
  'Ã‡': 'Ç',
  'Ãƒ': 'Ã',
  'Ã ': 'À',
  'Ã‰': 'É',
  'Ã“': 'Ó',
  'Ãš': 'Ú',
  'Âº': 'º',
  'Âª': 'ª',
  'Ã\xad': 'í', 
};
for (const file of files) {
  try {
    let text = fs.readFileSync(file, 'utf8');
    let original = text;
    for (const [bad, good] of Object.entries(replacements)) {
      text = text.split(bad).join(good);
    }
    if (text !== original) {
      fs.writeFileSync(file, text, 'utf8');
      console.log('Fixed', file);
      count++;
    }
  } catch(e) {}
}
console.log('Total fixed:', count);
