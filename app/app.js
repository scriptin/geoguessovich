const GUESSES_HISTORY_LENGTH = 5;
const MAX_PREVIOUS_GUESSES_NO_REPEAT = 3;

async function loadCountriesData(progressBar) {
    const response = await fetch('countries.json');
    const countries = await response.json();
    progressBar.style.width = '1%'; // because countries data has been loaded

    return countries;
}

async function loadCitiesData(countryCodes, progressBar) {
    const cities = {};

    // Loading in parallel
    const requests = [];
    for (const code of countryCodes) {
        requests.push(
            fetch(`cities/${code}.json`)
                .then(data => data.json())
                .then(json => {
                    cities[code] = json;
                    const total = countryCodes.length + 1; // +1 for countries data
                    const loaded = Object.keys(cities).length + 1;
                    const percent = Math.trunc((loaded / total) * 100);
                    progressBar.style.width = `${percent}%`;
                })
                .catch(e => console.error(e))
        );
    }
    await Promise.all(requests);

    return cities;
}

function createAutocompleteItem(countryCode, countryData, ordinalNumber, countryInput) {
    const element = document.createElement('div');
    element.classList.add('autocomplete-item');

    if (!countryCode) {
        element.classList.add('nothing-found');
        element.appendChild(document.createTextNode('Nothing found'));
    } else {
        const [domain, name, ...otherNames] = countryData;

        const kbdEl = document.createElement('kbd');
        kbdEl.appendChild(document.createTextNode(ordinalNumber))
        element.appendChild(kbdEl);

        const domainEl = document.createElement('code');
        domainEl.appendChild(document.createTextNode(domain));
        element.appendChild(domainEl);

        const allNames = [name, ...otherNames].join(', ');
        const namesEl = document.createElement('span');
        namesEl.appendChild(document.createTextNode(allNames));
        element.appendChild(namesEl);

        element.setAttribute('tabindex', '0');
        element.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                element.blur();
                countryInput.focus();
            }
        });
    }

    return element;
}

/**
 * Get a random value, with a probability of getting it
 * proportional to its weight.
 *
 * @param probabilities Array of [value, weight]
 * @returns {*} A random value
 */
function getRandomProportional(probabilities) {
    const total = probabilities.reduce((sum, [_value, p]) => sum + p , 0);
    const r = Math.random() * total;
    let runningSum = 0;
    for (let [value, p] of probabilities) {
        runningSum += p;
        if (runningSum >= r) {
            return value;
        }
    }
}

/**
 * Get a random country code, with a probability of getting it
 * proportional to number of cities in it,
 * excluding the codes which were used recently.
 *
 * @param countryCodes Array of country codes
 * @param cities Object: code -> array of cities
 * @param recentCodes Array of recently used codes
 * @returns {*} A random code
 */
function getRandomCountryCode(countryCodes, cities, recentCodes) {
    const probabilities = countryCodes.map(code => {
        if (recentCodes.includes(code)) {
            return [code, 0];
        }
        return [code, cities[code].length];
    }).filter(([_country, nCities]) => nCities > 0);
    return getRandomProportional(probabilities);
}

/**
 * Get a random city, with a probability of getting it
 * proportional to its population.
 *
 * @param cities Array of [cityName, population]
 * @returns {*} A random city name
 */
function getRandomCityName(cities) {
    const probabilities = cities.filter(([_city, population]) => population > 0);
    return getRandomProportional(probabilities);
}

function updateUI(game) {
    console.log(game);
    game.elements.cityNameDisplay.textContent = game.cityName;
}

function newQuestion(game) {
    const countryCode = getRandomCountryCode(
        game.countryCodes,
        game.cities,
        game.previousGuesses.slice(0, MAX_PREVIOUS_GUESSES_NO_REPEAT).map(g => g.country.code),
    );
    game.cityName = getRandomCityName(game.cities[countryCode]);
    game.country = {
        code: countryCode,
        name: game.countries[countryCode][1]
    };
    updateUI(game);
}

function makeGuess(game, guessCountryCode, cityNameDisplay) {
    game.previousGuesses.unshift({
        cityName: game.cityName,
        country: {
            name: game.countries[game.countryCode][1],
            code: guessCountryCode,
        },
        guessedCountryName: game.countries[guessCountryCode][1],
        correct: guessCountryCode === game.countryCode,
    });
    if (game.previousGuesses.length > GUESSES_HISTORY_LENGTH) {
        game.previousGuesses.shift();
    }
    newQuestion(game, cityNameDisplay);
}

function setUpCountryInput(game) {
    const { countryInput, autocomplete } = game.elements;
    countryInput.addEventListener('input', (e) => {
        const value = e.target.value
            .toLowerCase()
            .trim()
            .replaceAll(/\s{2,}/gi, ' ');
        const valueIsEmpty = value === '' || value === '.';
        const matchingCodes = valueIsEmpty ? [] : game.countryCodes.filter(code => {
            const [domain, ...names] = game.countries[code];
            return code.startsWith(value)
                || domain.startsWith(value)
                || domain === `.${value}`
                || !!names.find(n => n.toLowerCase().includes(value));
        }).slice(0, 9); // only take first 9 to have 1-digit ordinal numbers
        autocomplete.innerHTML = '';
        autocomplete.style.display = 'block';
        if (matchingCodes.length > 0) {
            matchingCodes.forEach((code, index) => {
                autocomplete.appendChild(
                    createAutocompleteItem(
                        code,
                        game.countries[code],
                        index + 1,
                        countryInput,
                    )
                );
            });
        } else if (!valueIsEmpty) {
            autocomplete.appendChild(createAutocompleteItem(false));
        } else {
            autocomplete.style.display = 'none';
        }
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const progressBar = loading.getElementsByClassName('progress-bar')[0];
    const app = document.getElementById('app');
    const countryInput = document.getElementById('county-input');
    const autocomplete = document.getElementById('autocomplete');
    const cityNameDisplay = document.getElementById('city-name');

    progressBar.style.width = '0%';
    loading.classList.remove('hide');
    app.classList.add('hide');

    const countries = await loadCountriesData(progressBar);
    const countryCodes = Object.keys(countries)
        .filter(code => !['_comment', 'vi', 'cx'].includes(code))
        .sort();

    const cities = await loadCitiesData(countryCodes, progressBar);

    loading.classList.add('hide');
    app.classList.remove('hide');

    const game = {
        countryCodes,
        countries,
        cities,
        cityName: '',
        countryCode: '',
        countryName: '',
        previousGuesses: [
            // { cityName: string, country: { name: string, code: string }, guessedCountryName: string, correct: boolean }
            // most recent goes first
        ],
        elements: {
            countryInput,
            autocomplete,
            cityNameDisplay,
        },
    };

    newQuestion(game);
    setUpCountryInput(game);
});
