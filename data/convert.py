#!/usr/bin/python3

import csv
import json

with open('countries.json') as countries_f:
    countries = json.load(countries_f)
    country_codes = list(filter(lambda k: k != '_comment', countries.keys()))
    print(country_codes)
    result = {}
    with open('worldcities.csv', newline='') as cities_f:
        reader = csv.DictReader(cities_f)
        for row in reader:
            code = row['iso2'].lower()
            if code in country_codes:
                name = row['city']
                population = 0
                try:
                    population = int(float(row['population']))
                except:
                    print(f'Could not parse population of {name} ({code}) - skipping')
                if population > 0:
                    if code not in result.keys():
                        result[code] = []
                    result[code].append([name, population])
    for code in country_codes:
        if code in result.keys():
            with open(f'cities/{code}.json', 'w') as out_f:
                json.dump(result[code], out_f)
