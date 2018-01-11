const camelCase = require('lodash.camelcase');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const sander = require('@marionebl/sander');

const SOURCE = 'https://en.wikipedia.org/wiki/ANSI_escape_code';

main()
    .catch(err => {
        console.log(err);
        process.exit(1);
    });

async function main() {
    const html = await fetchHtml(SOURCE);
    const $ = cheerio.load(html);

    const table = $($('#Colors').parents('h2').nextAll('table').get(0));
    const head = table.find('tr:first-child').children('th');
    const first = table.find('tr:not(:first-child) > td:first-child');
    const data = table.find('tr:not(:first-child) > td:nth-child(3) ~ td');

    const labels = getLabels(head, n => n.name !== 'sup')
        .map(l => {
            l.name = l.displayName.split(/[^a-zA-Z0-9]/g)[0].toLowerCase();
            return l;
        });

    const colors = getLabels(first)
        .map(l => {
            l.name = camelCase(l.displayName);
            l.y = l.index;
            return l;
        });

    const matrix = data.toArray().reduce((acc, item) => {
        const $item = $(item);
        const x = $item.index() - 3;
        const y = $(item.parentNode).index() - 1;
        const value = getTextNodes(item, n => n.name !== 'sup').map(n => n.nodeValue).join('');

        acc.push({
            x,
            y,
            value
        }); 

        if ($item.attr('colspan')) {
           const span = parseInt($item.attr('colspan'), 10);
           for (let i = 0; i <= span; i++) {
             acc.push({
                 x: x + i,
                 y,
                 value
             });
           }
        }

        return acc;
    }, []);

    const terminals = labels
        .filter(l => l.name !== 'name' && l.name !== 'fg' && l.name !== 'bg')
        .map(l => {
            l.x = l.index - 3;
            return l;
        });

    const json = terminals.reduce((result, terminal) => {
        result[terminal.name] = {
            displayName: terminal.displayName,
            name: terminal.name,
            colors: colors.map(c => {
                const item = matrix.find(i => i.x === terminal.x && i.y === c.y);
                const source = item.value ? item : matrix.find(i => i.x === 0 && i.y === c.y);
                return Object.assign({
                    displayName: c.displayName,
                    id: c.index,
                    name: c.name
                }, {
                    rgb: source.value.split(',')
                        .map(f => f.trim())
                        .map(f => parseInt(f, 10))
                });
            })
        };
        return result;
    }, {});

    await sander.writeFile('./index.json', JSON.stringify(json, null, '  '));
}

const ID = () => true;

async function fetchHtml() {
    if (!await sander.exists('./source.html')) {
        const respone = await fetch(SOURCE);
        const text = await respone.text();
        await sander.writeFile('./source.html', await text);
        return text;
    }

    return String(await sander.readFile('./source.html'));
}

function getLabels(collection, filter) {
    return collection.toArray()
        .map((item, i) => {
            const displayName = getTextNodes(item, filter)
                .map(t => t.nodeValue)
                .join('')
                .trim();

            return {displayName, index: i};
        });
}

function getTextNodes(node, filter) {
    if (node.type === 'text') {
        return [node];
    }
    return node.childNodes
        .filter(filter || ID)
        .reduce((acc, node) => [...acc, ...getTextNodes(node, filter)], []);
}