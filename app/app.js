window.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const progressBar = loading.getElementsByClassName('progress-bar')[0];
    const app = document.getElementById('app');

    progressBar.style.width = '0%';
    loading.classList.remove('hide');
    app.classList.add('hide');

    const response = await fetch('countries.json');
    const countries = await response.json();
    progressBar.style.width = '1%';
    const countryCodes = Object.keys(countries).filter(code => !['_comment', 'vi', 'cx'].includes(code));
    const cities = {};

    const updateProgressBar = () => {
        const total = countryCodes.length + 1;
        const loaded = Object.keys(cities).length + 1;
        const percent = Math.trunc((loaded / total) * 100);
        progressBar.style.width = `${percent}%`;
    }

    const requests = [];
    for (const code of countryCodes) {
        requests.push(
            fetch(`cities/${code}.json`)
                .then(data => data.json())
                .then(json => {
                    cities[code] = json;
                    updateProgressBar();
                })
                .catch(e => console.error(e))
        );
    }
    await Promise.all(requests);

    loading.classList.add('hide');
    app.classList.remove('hide');
});
