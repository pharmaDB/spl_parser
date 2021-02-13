// tslint:disable-next-line:no-var-requires
const fs = require('fs');
import * as cheerio from 'cheerio';

/**
 * just an interface to enforce an object that contains unlimited key value pairs of which the value can be of any type
 */
interface OpenObject {
  [key: string]: any;
}

/**
 *
 * @param elements
 */
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

/**
 * Parse out entires in the sections CSV file and map them to an object in key values pairs. The Resulting mapping lets
 * the subsequent parsing functions know what sections to parse the XML SPL for and what to title the resulting
 * sections in the JSON output.
 * @param sectionsFilepath: the file path for the location of the sections.csv config file
 */
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

/**
 * Iterate through the jQuery enabled SPL document and parse out individual sections based on the standardized
 * categories provided in the sections CSV config file. Parse out each categories body and add the category
 * name:["body"] to the JSON response as a key value pair.
 * @param $: A cheerio Root section object (ie XML document in a jQuery for Node wrapper)
 * @param jsonResponse: the in-work jsonResponse that represents the XML SPL doc but in JSON format
 * @param sectionsMap: mapping that defines which SPL REMS section definitions will be looked for while parsing the SPL
 */
const populateSectionsFromXml = ($: cheerio.Root, jsonResponse: OpenObject, sectionsMap: OpenObject) => {
  // load the xml into a JQuery for Node wrapper
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

/**
 * Iterate through the jQuery enabled SPL document and parse out top level metadata to add to the JSON response
 * @param $: A cheerio Root section object (ie XML document in a jQuery for Node wrapper)
 * @param jsonResponse: the in-work jsonResponse that represents the XML SPL doc but in JSON format
 */
const populateMetaDataFromXml = ($: cheerio.Root, jsonResponse: OpenObject) => {
        jsonResponse[`set_id`] = $('setId').attr('root');
        jsonResponse[`id`] = $('id').attr('root');
        jsonResponse[`effective_time`] = $('effectiveTime').attr('value');
        jsonResponse[`version`] = $('versionNumber').attr('value');
}

/**
 * Parse out a provided XML SPL string into JSON based on the categories provided in the sections CSV config
 * @param xmlSplString: A XML SPL document in string format. This could be a very large string.
 */
export function parse(xmlSplString: string) {
    const jsonResponse: OpenObject = {};

    // parse the sections configuration CSV and wrap the XML SPL doc in a jQuery wrapper
    const sectionsMap = parseSections('./sections.csv');
    const jQueryWrappedSPLDocumentRoot = cheerio.load(xmlSplString, {
        normalizeWhitespace: true,
        xmlMode: true
    });

    // parse the sections/content and the top level metadata out and into the returned jsonResponse object
    populateSectionsFromXml(jQueryWrappedSPLDocumentRoot, jsonResponse, sectionsMap);
    populateMetaDataFromXml(jQueryWrappedSPLDocumentRoot, jsonResponse);
    return jsonResponse;
}
