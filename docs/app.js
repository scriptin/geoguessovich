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
 * How many last previously chosen countries to account for
 * when generating the next question. This is to make question
 * generation "more random" (from user perspective),
 * making sure that same item doesn't get chosen several times in a row.
 *
 * - Must be lower than total number of countries
 * - Must be lower than or equal to {@link INTERNAL_GUESSES_HISTORY_LENGTH}
 * @type {number}
 */
const PREVIOUS_QUESTIONS_RECENT_LIST_LENGTH = 5;

/**
 * Maximum denominator penalty for recent appearance.
 * It means that if a country was just chosen in the previous round,
 * it is X times LESS likely to be chosen in the current round.
 * @type {number}
 */
const MAX_RECENCY_PENALTY_DENOMINATOR = 10;

/**
 * - Must match those in index.html <datalist>
 * - Must start with 0 and contain subsequent natural numbers, without skipping
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

/**
 * @typedef {[population: number, countryCode: string]} CityPopulationDataItem
 *
 * @typedef {{
 *     [cityName: string]: CityPopulationDataItem[],
 * }} Cities
 *
 * @typedef {{
 *     [countryCode: string]: string[],
 * }} Countries
 *
 * @typedef {{
 *     cityName: string,
 *     cityPopulations: CityPopulationDataItem[],
 *     guessedCountryCode: string,
 *     guessedCountryName: string,
 *     actualCountryNames: string[],
 *     correct: boolean,
 * }} Guess
 *
 * @typedef {{
 *     countryCodes: string[],
 *     countries: Countries,
 *     cities: Cities,
 *     cityName: string,
 *     cityPopulations: CityPopulationDataItem[],
 *     difficultyLevel: number,
 *     countryCode: string,
 *     countryName: string,
 *     elements: {
 *         countryInput: HTMLElement,
 *         autocomplete: HTMLElement,
 *         difficultyInput: HTMLElement,
 *         cityNameDisplay: HTMLElement,
 *         historyDisplay: HTMLElement
 *     },
 *     guesses: Guess[],
 * }} Game
 */

/**
 * @param progressBar {HTMLElement}
 * @returns {Promise<Countries>}
 */
async function loadCountriesData(progressBar) {
    const response = await fetch('countries.json');
    const countries = await response.json();
    progressBar.style.width = '10%'; // because there are 9 buckets
    progressBar.dataset.progress = '10';

    return countries;
}

/**
 * @param progressBar {HTMLElement}
 * @returns {Promise<Cities>}
 */
async function loadCitiesData(progressBar) {
    const cities = {};

    // Loading in parallel
    const requests = [];
    for (let bucket = 1; bucket <= 9; bucket++) {
        requests.push(
            fetch(`cities/${bucket}.json`)
                .then(data => data.json())
                .then(json => {
                    for (let cityName of Object.keys(json)) {
                        cities[cityName] = json[cityName];
                    }
                    const progress = Number.parseInt(progressBar.dataset.progress, 10);
                    progressBar.style.width = `${progress + 10}%`;
                    progressBar.dataset.progress = (progress + 10).toString();
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

/**
 * @param game {Game}
 * @param countryCode {string|false}
 * @param ordinalNumber {number?}
 * @return {HTMLDivElement}
 */
function createAutocompleteItem(game, countryCode, ordinalNumber) {
    const { countryInput, autocomplete } = game.elements;
    const element = document.createElement('div');
    element.classList.add('autocomplete-item');

    if (!countryCode) {
        element.classList.add('nothing-found');
        element.appendChild(document.createTextNode('Nothing found'));
    } else if (ordinalNumber != null) {
        const [domain, name, ...otherNames] = game.countries[countryCode];

        const kbdEl = document.createElement('kbd');
        kbdEl.appendChild(document.createTextNode(ordinalNumber.toString()))
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
 * @param weights {[value: any, weight: number][]}
 * @param difficultyLevel {number} Number from 1 to 5
 * @returns {any} A random value
 */
function getRandomProportional(weights, difficultyLevel) {
    const exponentDenominator = difficultyExponentDenominators[difficultyLevel];
    if (exponentDenominator == null) {
        throw new Error('Invalid game difficulty level: ' + difficultyLevel);
    }
    const adjustedWeights = weights.map(([value, weight]) => (
        [value, Math.ceil(Math.pow(weight, 1 / exponentDenominator))]
    ))

    const total = adjustedWeights.reduce((sum, [_, weight]) => sum + weight , 0);
    const r = Math.random() * total;
    let runningSum = 0;
    for (let [value, weight] of adjustedWeights) {
        runningSum += weight;
        if (runningSum >= r) {
            return value;
        }
    }
}

const cache = {};

/**
 * Get a random city, with a probability of getting it
 * proportional to its population.
 *
 * @param cities {Cities}
 * @param difficultyLevel {number} Number from 1 to 5
 * @returns {string} A random city name
 */
function getRandomCityName(cities, difficultyLevel) {
    if (!cache.weights) {
        const max = (a, b) => Math.max(a, b);
        // Use max. population as a weight
        cache.weights = Object.keys(cities).map((cityName) => [
            cityName,
            cities[cityName].map(([pop]) => pop).reduce(max, 0),
        ]);
    }
    return getRandomProportional(cache.weights, difficultyLevel);
}

/**
 * @param population {number}
 * @returns {string}
 */
function formatPopulation(population) {
    if (population > 1e6) {
        return (population / 1e6).toFixed(1).replace('.0', '') + 'M';
    } else if (population > 1e3) {
        return (population / 1e3).toFixed(1).replace('.0', '') + 'K';
    }
    return population.toString();
}

/**
 * @param names {string[]}
 * @return {string}
 */
function formatCountryNames(names) {
    const sorted = [...names].sort();
    let result = [];
    for (let name of sorted) {
        if (result.length === 0 ) {
            result.push([name, 1]);
        } else {
            const lastIndex = result.length - 1;
            const [lastName, lastCount] = result[lastIndex];
            if (lastName === name) {
                result[lastIndex] = [name, lastCount + 1]
            } else {
                result.push([name, 1]);
            }
        }
    }
    let concatenated = '';
    let i = 0;
    while (i < result.length) {
        let separator = ', ';
        if (i === result.length - 2) {
            separator = ', or ';
        } else if (i === result.length - 1) {
            separator = '';
        }
        concatenated += result[i][0] + (result[i][1] > 1 ? ` (${result[i][1]} cities)` : '') + separator;
        i++;
    }
    return concatenated;
}

/**
 * @param guess {Guess}
 * @param index {number}
 * @returns {HTMLDivElement}
 */
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

    const guessedCountryPopulationData = guess.cityPopulations.find(([_, cCode]) => cCode === guess.guessedCountryCode);
    const topPopulation = guess.cityPopulations.sort((a, b) => a[0] - b[0])[0];
    const population = guess.correct
        ? guessedCountryPopulationData[0]
        : topPopulation[0];
    const cityPopulation = document.createElement('span');
    const populationSuffix = guess.cityPopulations.length > 1 ? ` (in ${topPopulation[1]})` : '';
    cityPopulation.appendChild(document.createTextNode(formatPopulation(population) + populationSuffix));
    cityPopulation.setAttribute('title', `population = ${population}${populationSuffix}`)
    element.appendChild(cityPopulation);

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
    correctGuess.appendChild(document.createTextNode(formatCountryNames(guess.actualCountryNames)));
    element.appendChild(correctGuess);

    return element;
}

/**
 * @param game {Game}
 */
function updateUI(game) {
    console.log(game);
    const { cityNameDisplay, historyDisplay } = game.elements;
    cityNameDisplay.textContent = game.cityName;
    if (game.guesses.length > 0) {
        historyDisplay.innerHTML = '';
        game.guesses.slice(0, VISIBLE_GUESSES_HISTORY_LENGTH).forEach((guess, index) => {
            historyDisplay.append(createGuessHistoryItem(guess, index));
        });
    }
}

/**
 * @param game {Game}
 */
function newQuestion(game) {
    const cityName = getRandomCityName(
        game.cities,
        game.difficultyLevel,
    );
    game.cityName = cityName;
    game.cityPopulations = game.cities[cityName];
    updateUI(game);
}

/**
 * @param game {Game}
 * @param guessedCountryCode {string}
 */
function makeGuess(game, guessedCountryCode) {
    const { guesses, countries, cityName, cityPopulations } = game;
    const actualCountryCodes = cityPopulations.map(([_, cCode]) => cCode);
    guesses.unshift({
        cityName,
        cityPopulations,
        guessedCountryCode,
        guessedCountryName: countries[guessedCountryCode][1],
        actualCountryNames: actualCountryCodes.map((code) => countries[code][1]),
        correct: actualCountryCodes.includes(guessedCountryCode),
    });
    if (guesses.length > INTERNAL_GUESSES_HISTORY_LENGTH) {
        guesses.splice(INTERNAL_GUESSES_HISTORY_LENGTH);
    }
    newQuestion(game);
}

/**
 * @param game {Game}
 */
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

/**
 * @param game {Game}
 */
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

    const cities = await loadCitiesData(progressBar);

    loading.classList.add('hide');
    app.classList.remove('hide');

    /**
     * @type {Game}
     */
    const game = {
        countryCodes,
        countries,
        cities,
        difficultyLevel: 0,
        cityName: '',
        cityPopulations: [],
        countryCode: '',
        countryName: '',
        guesses: [],
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
