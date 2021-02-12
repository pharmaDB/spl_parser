var fs = require('fs');
import * as cheerio from 'cheerio';

interface OpenObject {
  [key: string]: any;
}

const toText = function(elems: any) {
    var ret = '',
      len = elems.length,
      elem;
  
    for (var i = 0; i < len; i++) {
      elem = elems[i];
      if (elem.type === 'text' && elem.data.trim().length > 0) ret += (elem.data + ' ');
      else if (elem.children && elem.type !== 'comment') {
        ret += toText(elem.children);
      }
    }
  
    return ret;
  };

function parseSections(sections_filepath: string): OpenObject {
  // read the CSV and split it on line breaks
  var csv = fs.readFileSync(sections_filepath, 'utf-8');
  var csv_split = csv.split('\n');

  // iterate through the CSV entries and map them to code keys
  var code_to_name: OpenObject = {};
  for (let i = 0; i < csv_split.length; i++) {
    var csv_line = csv_split[i].replace(/"/, '');
    var row = csv_line.split(',');

    var code = row[0];
    var name_for_json = row[1].replace(/:/, '').replace(/ & /g, ' and ');
    name_for_json = name_for_json.replace(/\//, ' or ');
    name_for_json = name_for_json.replace(/ /g, '_').toLowerCase();
    name_for_json = name_for_json.replace(/spl_unclassified/, 'spl_unclassified_section');
    code_to_name[code] = name_for_json;
  }

  return code_to_name;
}

function populateSectionsFromXml(xmlSplString: string, jsonResponse: OpenObject, sectionsMap: OpenObject) {
  // load the xml into a JQuery for Node wrapper
  const $ = cheerio.load(xmlSplString, {
    normalizeWhitespace: true,
    xmlMode: true,
  });

  var previous_sections = [];

  $('section').each(function (i, section) {
    var code = 'spl_unclassified_section';

    var section_code = $(section).find('code').attr('code');
    if (section_code) {
        var section_name = sectionsMap[section_code];
        if (section_name) {
            code = section_name;
        }
    }

    // For sections like recent_major_changes which have statements broken apart by <br/>
    $('br').replaceWith(' ');

    var is_subsection = $(section).parentsUntil($('section')).length == 1;

    // Only include subsections if they are classified. There's no reason to duplicate the text otherwise.
    if (!(code == 'spl_unclassified_section' && is_subsection)) {
      if (jsonResponse[code] == undefined) {
        jsonResponse[code] = [];
      }
      var text = toText($(section)).trim().replace(/ +/gm, ' ');
      jsonResponse[code].push(text);

      $(section)
        .find('table')
        .each(function (j, table) {
          var code_table = code + '_table';
          if (jsonResponse[code_table] == undefined) {
            jsonResponse[code_table] = [];
          }
          jsonResponse[code_table].push($.html(table));
        });
    }
  });
}

function populateMetaDataFromXml(xml_filepath: string, jsonResponse: OpenObject) {
        // Process xml for meta data fields
        const $ = cheerio.load(xml_filepath, {
          normalizeWhitespace: true,
          xmlMode: true
        });
      
        jsonResponse['set_id'] = $('setId').attr('root');
        jsonResponse['id'] = $('id').attr('root');
        jsonResponse['effective_time'] = $('effectiveTime').attr('value');
        jsonResponse['version'] = $('versionNumber').attr('value');
}

export function parse(xmlSplString: string) {
  const jsonResponse: OpenObject = {};
  const sectionsMap = parseSections('./sections.csv');
  populateSectionsFromXml(xmlSplString, jsonResponse, sectionsMap);
  populateMetaDataFromXml(xmlSplString, jsonResponse);
  return jsonResponse;
}
