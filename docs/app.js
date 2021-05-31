/**
 * How many last guesses to show in UI
 * @type {number}
 */
const VISIBLE_GUESSES_HISTORY_LENGTH = 5;

/**
 * How many last guesses to keep internally
 * @type {number}
 */
const INTERNAL_GUESSES_HISTORY_LENGTH = 1000;

/**
 * How many last guessed countries to exclude from new question generation.
 * Must be lower than total number of countries
 * and also lower than or equal to {@link INTERNAL_GUESSES_HISTORY_LENGTH}
 * @type {number}
 */
const PREVIOUS_GUESSES_NO_REPEAT = 5;

/**
 * Must match those in index.html <datalist>
 * Must start with 0 and contain subsequent natural numbers, without skipping
 * @type {number[]}
 */
const DIFFICULTY_LEVELS = [0, 1, 2, 3, 4];

/**
 * Exponent denominator is used to scale down the weight
 * of a country/city by calculating `Math.pow(weight, 1/d)`,
 * where `d` is the denominator value.
 *
 * Simply, by controlling the exponent denominator we can control game difficulty:
 *
 * - if the exponent is closer to 1 (d = 1), bigger cities and countries appear more often
 * - if the exponent is closer to zero (d is bigger than 1),
 *   the distribution of small and big countries/cities is more even
 * @type {number[]}
 */
const difficultyExponentDenominators = DIFFICULTY_LEVELS.map(v => Math.exp(v / (DIFFICULTY_LEVELS.length - 1)));

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

function setCaretToEnd(input) {
    // Using timeout because when pressing up arrow key
    // the caret shifts to the beginning be default
    setTimeout(() => {
        const lastChar = input.value.length;
        input.setSelectionRange(lastChar, lastChar);
    }, 1);
}

function createAutocompleteItem(game, countryCode, ordinalNumber) {
    const { countryInput, autocomplete } = game.elements;
    const element = document.createElement('div');
    element.classList.add('autocomplete-item');

    if (!countryCode) {
        element.classList.add('nothing-found');
        element.appendChild(document.createTextNode('Nothing found'));
    } else {
        const [domain, name, ...otherNames] = game.countries[countryCode];

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
        element.setAttribute('title', `Press '${ordinalNumber}' key to pick this option`);

        const submitGuess = () => {
            makeGuess(game, countryCode);
            autocomplete.innerHTML = '';
            autocomplete.style.display = 'none';
            countryInput.value = '';
            countryInput.focus();
        };

        element.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                element.blur();
                countryInput.focus();
                setCaretToEnd(countryInput);
            } else if (e.key === 'Enter') {
                submitGuess();
            } else if (e.key === 'Down' || e.key === 'ArrowDown') {
                if (element.nextElementSibling) {
                    element.nextElementSibling.focus();
                } else {
                    // At the bottom of the list - move focus back to input
                    countryInput.focus();
                    setCaretToEnd(countryInput);
                }
            } else if (e.key === 'Up' || e.key === 'ArrowUp') {
                if (element.previousElementSibling) {
                    element.previousElementSibling.focus();
                } else {
                    // At the top of the list - move focus back to input
                    countryInput.focus();
                    setCaretToEnd(countryInput);
                }
            }
        });

        element.addEventListener('click', () => {
            submitGuess();
        });
    }

    return element;
}

/**
 * Get a random value, with a probability of getting it
 * proportional to its weight.
 *
 * @param weights Array of [value, weight]
 * @param difficultyLevel Number from 1 to 5
 * @returns {*} A random value
 */
function getRandomProportional(weights, difficultyLevel) {
    const exponentDenominator = difficultyExponentDenominators[difficultyLevel];
    if (exponentDenominator == null) {
        throw new Error('Invalid game difficulty level: ' + difficultyLevel);
    }
    const adjustedWeights = weights.map(([v, p]) => (
        [v, Math.ceil(Math.pow(p, 1 / exponentDenominator))]
    ))

    const total = adjustedWeights.reduce((sum, [_value, p]) => sum + p , 0);
    const r = Math.random() * total;
    let runningSum = 0;
    for (let [value, p] of adjustedWeights) {
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
 * @param difficultyLevel Number from 1 to 5
 * @returns {*} A random code
 */
function getRandomCountryCode(countryCodes, cities, recentCodes, difficultyLevel) {
    const probabilities = countryCodes.map(code => {
        if (recentCodes.includes(code)) {
            return [code, 0];
        }
        return [code, cities[code].length];
    }).filter(([_country, nCities]) => nCities > 0);
    return getRandomProportional(probabilities, difficultyLevel);
}

/**
 * Get a random city, with a probability of getting it
 * proportional to its population.
 *
 * @param cities Array of [cityName, population]
 * @param difficultyLevel Number from 1 to 5
 * @returns {*} A random city name
 */
function getRandomCityName(cities, difficultyLevel) {
    const probabilities = cities.filter(([_city, population]) => population > 0);
    return getRandomProportional(probabilities, difficultyLevel);
}

function createGuessHistoryItem(guess, index) {
    const element = document.createElement('div');
    element.classList.add('history-item');
    if (index === 0) {
        setTimeout(() => {
            element.classList.add('first');
        }, 10);
    }

    const cityName = document.createElement('strong');
    cityName.appendChild(document.createTextNode(guess.cityName));
    element.appendChild(cityName);

    const icon = document.createElement('span');
    icon.classList.add('icon');
    icon.appendChild(document.createTextNode(guess.correct ? '✅' : '❌'));
    element.appendChild(icon);

    if (!guess.correct) {
        const incorrectGuess = document.createElement('span');
        incorrectGuess.classList.add('incorrect-guess');
        incorrectGuess.appendChild(document.createTextNode(guess.guessedCountryName));
        element.appendChild(incorrectGuess);
    }

    const correctGuess = document.createElement('span');
    correctGuess.classList.add('correct-guess');
    correctGuess.appendChild(document.createTextNode(guess.country.name));
    element.appendChild(correctGuess);

    return element;
}

function updateUI(game) {
    console.log(game);
    const { cityNameDisplay, historyDisplay } = game.elements;
    cityNameDisplay.textContent = game.cityName;
    if (game.previousGuesses.length > 0) {
        historyDisplay.innerHTML = '';
        game.previousGuesses.slice(0, VISIBLE_GUESSES_HISTORY_LENGTH).forEach((guess, index) => {
            historyDisplay.append(createGuessHistoryItem(guess, index));
        });
    }
}

function newQuestion(game) {
    const countryCode = getRandomCountryCode(
        game.countryCodes,
        game.cities,
        game.previousGuesses.slice(0, PREVIOUS_GUESSES_NO_REPEAT).map(g => g.country.code),
        game.difficultyLevel,
    );
    game.cityName = getRandomCityName(
        game.cities[countryCode],
        game.difficultyLevel,
    );
    game.country = {
        code: countryCode,
        name: game.countries[countryCode][1]
    };
    updateUI(game);
}

function makeGuess(game, guessCountryCode) {
    game.previousGuesses.unshift({
        cityName: game.cityName,
        country: {
            code: game.country.code,
            name: game.countries[game.country.code][1],
        },
        guessedCountryName: game.countries[guessCountryCode][1],
        correct: guessCountryCode === game.country.code,
    });
    if (game.previousGuesses.length > INTERNAL_GUESSES_HISTORY_LENGTH) {
        game.previousGuesses.pop();
    }
    newQuestion(game);
}

function setUpCountryInput(game) {
    const { countryInput, autocomplete } = game.elements;

    const cleanInputValue = (inputValue) => inputValue
        .toLowerCase()
        .trim()
        .replaceAll(/\s{2,}/gi, ' ');

    const getMatchingCodes = (value) => {
        return game.countryCodes.filter(code => {
            const [domain, ...names] = game.countries[code];
            return code.startsWith(value)
                || domain.startsWith(value)
                || domain === `.${value}`
                || !!names.find(n => n.toLowerCase().includes(value));
        }).slice(0, 9); // only take first 9 to have 1-digit ordinal numbers
    };

    const updateAutocomplete = (inputValue) => {
        const value = cleanInputValue(inputValue);
        const valueIsEmpty = value === '' || value === '.';
        const matchingCodes = valueIsEmpty ? [] : getMatchingCodes(value);
        autocomplete.innerHTML = '';
        autocomplete.style.display = 'none';
        if (matchingCodes.length > 0) {
            autocomplete.style.display = 'block';
            matchingCodes.forEach((code, index) => {
                autocomplete.appendChild(
                    createAutocompleteItem(game, code, index + 1)
                );
            });
        } else if (!valueIsEmpty) {
            autocomplete.style.display = 'block';
            autocomplete.appendChild(
                createAutocompleteItem(game, false)
            );
        }
    }

    countryInput.addEventListener('input', (e) => {
        updateAutocomplete(e.target.value);
    });

    countryInput.addEventListener('keydown', (e) => {
        if (!/^\d$/.test(e.key) && !['Enter', 'Down', 'ArrowDown', 'Up', 'ArrowUp'].includes(e.key)) {
            // Early exit if not a number, Enter, or an arrow key
            return;
        }
        const value = cleanInputValue(e.target.value);
        const valueIsEmpty = value === '' || value === '.';
        const matchingCodes = valueIsEmpty ? [] : getMatchingCodes(value);
        const hotKeys = [...Array(matchingCodes.length).keys()]
            .map((index) => (index + 1).toString(10));
        if (hotKeys.includes(e.key)) {
            const selectedOption = parseInt(e.key, 10) - 1;
            makeGuess(game, matchingCodes[selectedOption]);
            e.target.value = '';
            updateAutocomplete('');
            e.preventDefault();
        } else if (e.key === 'Enter' && matchingCodes.length === 1) {
            makeGuess(game, matchingCodes[0]);
            e.target.value = '';
            updateAutocomplete('');
            e.preventDefault();
        } else if (e.key === 'Down' || e.key === 'ArrowDown') {
            autocomplete.querySelector('[tabindex="0"]:first-child')?.focus();
        } else if (e.key === 'Up' || e.key === 'ArrowUp') {
            autocomplete.querySelector('[tabindex="0"]:last-child')?.focus();
        }
    })
}

function setUpDifficultyInput(game) {
    const { difficultyInput } = game.elements;
    difficultyInput.value = game.difficultyLevel;
    difficultyInput.addEventListener('change', e => {
        game.difficultyLevel = parseInt(e.target.value, 10) ?? 1;
    })
}

window.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const progressBar = loading.getElementsByClassName('progress-bar')[0];
    const app = document.getElementById('app');
    const difficultyInput = document.getElementById('difficulty-input');
    const countryInput = document.getElementById('country-input');
    const autocomplete = document.getElementById('autocomplete');
    const cityNameDisplay = document.getElementById('city-name');
    const historyDisplay = document.getElementById('history');

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
        difficultyLevel: 0,
        cityName: '',
        countryCode: '',
        countryName: '',
        previousGuesses: [
            // { cityName: string, country: { code: string, name: string }, guessedCountryName: string, correct: boolean }
            // most recent goes first
        ],
        elements: {
            difficultyInput,
            countryInput,
            autocomplete,
            cityNameDisplay,
            historyDisplay,
        },
    };

    newQuestion(game);
    setUpDifficultyInput(game);
    setUpCountryInput(game);
});
