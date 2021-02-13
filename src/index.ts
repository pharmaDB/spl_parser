// tslint:disable-next-line:no-var-requires
const fs = require('fs');
import * as cheerio from 'cheerio';

interface OpenObject {
  [key: string]: any;
}

const toText = (elements: any) => {
    let ret = '';
    const len = elements.length;
    let elem;

    for (let i = 0; i < len; i++) {
      elem = elements[i];
      if (elem.type === 'text' && elem.data.trim().length > 0) ret += (elem.data + ' ');
      else if (elem.children && elem.type !== 'comment') {
        ret += toText(elem.children);
      }
    }

    return ret;
  };

const parseSections = (sectionsFilepath: string): OpenObject => {
  // read the CSV and split it on line breaks
  const csv = fs.readFileSync(sectionsFilepath, 'utf-8');
  const csvSplit = csv.split('\n');

  // iterate through the CSV entries and map them to code keys
  const codeToName: OpenObject = {};
  csvSplit.forEach((item: any) => {
    const csvLine = item.replace(/"/, '');
    const row = csvLine.split(',');

    const code = row[0];
    let nameForJSON = row[1].replace(/:/, '').replace(/ & /g, ' and ');
    nameForJSON = nameForJSON.replace(/\//, ' or ');
    nameForJSON = nameForJSON.replace(/ /g, '_').toLowerCase();
    nameForJSON = nameForJSON.replace(/spl_unclassified/, 'spl_unclassified_section');
    codeToName[code] = nameForJSON;
  })

  return codeToName;
}

const populateSectionsFromXml = (xmlSplString: string, jsonResponse: OpenObject, sectionsMap: OpenObject) => {
  // load the xml into a JQuery for Node wrapper
  const $ = cheerio.load(xmlSplString, {
    normalizeWhitespace: true,
    xmlMode: true,
  });

  $('section').each((i, section) => {
    let code = 'spl_unclassified_section';

    const sectionCode = $(section).find('code').attr('code');
    if (sectionCode) {
        const sectionName = sectionsMap[sectionCode];
        if (sectionName) {
            code = sectionName;
        }
    }

    // For sections like recent_major_changes which have statements broken apart by <br/>
    $('br').replaceWith(' ');

    const isSubsection = $(section).parentsUntil($('section')).length === 1;

    // Only include subsections if they are classified. There's no reason to duplicate the text otherwise.
    if (!(code === 'spl_unclassified_section' && isSubsection)) {
      if (jsonResponse[code] === undefined) {
        jsonResponse[code] = [];
      }
      const text = toText($(section)).trim().replace(/ +/gm, ' ');
      jsonResponse[code].push(text);

      $(section)
        .find('table')
        .each((j, table) => {
          const codeTable = code + '_table';
          if (jsonResponse[codeTable] === undefined) {
            jsonResponse[codeTable] = [];
          }
          jsonResponse[codeTable].push($.html(table));
        });
    }
  });
}

const populateMetaDataFromXml = (xmlFilepath: string, jsonResponse: OpenObject) => {
        // Process xml for meta data fields
        const $ = cheerio.load(xmlFilepath, {
          normalizeWhitespace: true,
          xmlMode: true
        });

        jsonResponse[`set_id`] = $('setId').attr('root');
        jsonResponse[`id`] = $('id').attr('root');
        jsonResponse[`effective_time`] = $('effectiveTime').attr('value');
        jsonResponse[`version`] = $('versionNumber').attr('value');
}

export function parse(xmlSplString: string) {
  const jsonResponse: OpenObject = {};
  const sectionsMap = parseSections('./sections.csv');
  populateSectionsFromXml(xmlSplString, jsonResponse, sectionsMap);
  populateMetaDataFromXml(xmlSplString, jsonResponse);
  return jsonResponse;
}
