#!/usr/bin/python3

import csv
import json
import ctypes


def fast_hash(s):
    return str(ctypes.c_uint64(hash(s)).value)


def clean_data(arr):
    return [arr[1], arr[2]]


with open('countries.json') as countries_f:
    countries = json.load(countries_f)
    country_codes = list(filter(lambda k: k != '_comment', countries.keys()))
    print(country_codes)
    result = {}
    with open('worldcities.csv', newline='') as cities_f:
        reader = csv.DictReader(cities_f)
        for row in reader:
            country_code = row['iso2'].lower()
            if country_code not in country_codes:
                continue
            city_name = row['city']
            city_hash = fast_hash(city_name)
            bucket = city_hash[0]
            if bucket not in result.keys():
                result[bucket] = {}
            if city_hash not in result[bucket].keys():
                result[bucket][city_hash] = []
            try:
                population = int(float(row['population']))
                if population > 0:
                    result[bucket][city_hash].append([city_name, population, country_code])
            except:
                print(f'Could not parse population of {city_name} ({country_code}) - skipping')
    for bucket in result.keys():
        part = result[bucket]
        data = {}
        for city_data in part.values():
            if len(city_data) > 0:
                city_name = city_data[0][0]
                data[city_name] = list(map(clean_data, city_data))
        with open(f'cities/{bucket}.json', 'w') as out_f:
            json.dump(data, out_f)
