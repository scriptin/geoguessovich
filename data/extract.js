// Find largest .wikitable
let table = Array.from(document.getElementsByClassName('wikitable'))
  .map(tableElem => [tableElem, tableElem.innerHTML.length])
  .sort((a, b) => b[1] - a[1])[0][0];

function cleanHeader(text) {
  let result = text;
  [ // garbage
    "\n",
    "\r",
    /\[\d+\]/g, // note links
    /\[[a-z]]/g, // note links
  ].forEach(g => {
    result = result.replaceAll(g, ' ');
  });
  return result.replace(/\s+/, ' ').trim();
}

let columns = Array.from(table.querySelectorAll('.headerSort'))
  .map(headerElem => cleanHeader(headerElem.textContent));

let toNumber = v => parseInt(v.replaceAll(',', ''), 10);
let toString = cleanHeader;
let interestingColumnsDefs = [
  [/^rank/i, 'Rank', toNumber],
  [/^№/i, 'Rank', toNumber],
  [/^name/i, 'Name', toString],
  [/^city/i, 'Name', toString],
  [/^settlement/i, 'Name', toString],
  [/^place/i, 'Name', toString],
  [/^population(?! density)/i, 'Population', toNumber],
  [/^(Census )?2005/i, 'Population (2005)', toNumber],
  [/^(Census )?2006/i, 'Population (2006)', toNumber],
  [/^(Census )?2007/i, 'Population (2007)', toNumber],
  [/^(Census )?2008/i, 'Population (2008)', toNumber],
  [/^(Census )?2009/i, 'Population (2009)', toNumber],
  [/^(Census )?2010/i, 'Population (2010)', toNumber],
  [/^(Census )?2011/i, 'Population (2011)', toNumber],
  [/^(Census )?2012/i, 'Population (2012)', toNumber],
  [/^(Census )?2013/i, 'Population (2013)', toNumber],
  [/^(Census )?2014/i, 'Population (2014)', toNumber],
  [/^(Census )?2015/i, 'Population (2015)', toNumber],
  [/^(Census )?2016/i, 'Population (2016)', toNumber],
  [/^(Census )?2017/i, 'Population (2017)', toNumber],
  [/^(Census )?2018/i, 'Population (2018)', toNumber],
  [/^(Census )?2019/i, 'Population (2019)', toNumber],
  [/^(Census )?2020/i, 'Population (2020)', toNumber],
  [/^(Census )?2021/i, 'Population (2021)', toNumber],
];

// [name, idx, canonicalName, converter]
let interestingColumns = columns
  .map((name, idx) => [name, idx])
  .map(([name, idx]) => {
    const matchingDef = interestingColumnsDefs.find(([regex]) => regex.test(name));
    if (matchingDef) {
      return [name, idx, matchingDef[1], matchingDef[2]];
    }
    return null;
  })
  .filter(v => !!v);

let tableRows = Array.from(table.querySelectorAll('tbody>tr'));

let data = tableRows.map(row => {
  let result = [];
  interestingColumns.forEach(([name, idx, canonicalName, converter]) => {
    result.push(
      converter(row.querySelector(`td:nth-child(${idx + 1})`).textContent)
    );
  });
  return result;
});

data.unshift(interestingColumns.map(([name, idx, canonicalName]) => canonicalName))

console.log(JSON.stringify(data));
