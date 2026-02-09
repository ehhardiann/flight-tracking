from flask import Flask, render_template, jsonify
import requests
from datetime import datetime
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)

AVIATION_EDGE_API_KEY = 'c8f25e-938255'

flight_cache = {
    'data': [],
    'timestamp': None,
    'cache_duration': 120
}

timetable_cache = {
    'data': [],
    'timestamp': None,
    'cache_duration': 300
}

AIRPORTS = [
    'CGK','SUB','DPS','KNO','UPG',
    'JOG','HLP','BPN','PKU','BDO',
    'PLM','MDC','DJJ'
]

def fetch_live_departure(iata):
    try:
        r = requests.get(
            'https://aviation-edge.com/v2/public/flights',
            params={
                'key': AVIATION_EDGE_API_KEY,
                'depIata': iata,
                'status': 'en-route'
            },
            timeout=10
        )
        if r.status_code == 200 and isinstance(r.json(), list):
            return [
                f for f in r.json()
                if f.get('geography')
                and f['geography'].get('latitude')
                and f['geography'].get('longitude')
            ]
    except:
        pass
    return []

def fetch_live_arrival(iata):
    try:
        r = requests.get(
            'https://aviation-edge.com/v2/public/flights',
            params={
                'key': AVIATION_EDGE_API_KEY,
                'arrIata': iata,
                'status': 'en-route'
            },
            timeout=10
        )
        if r.status_code == 200 and isinstance(r.json(), list):
            return [
                f for f in r.json()
                if f.get('geography')
                and f['geography'].get('latitude')
                and f['geography'].get('longitude')
            ]
    except:
        pass
    return []

def fetch_timetable_departure(iata):
    try:
        r = requests.get(
            'https://aviation-edge.com/v2/public/timetable',
            params={
                'key': AVIATION_EDGE_API_KEY,
                'iataCode': iata,
                'type': 'departure'
            },
            timeout=10
        )
        if r.status_code == 200 and isinstance(r.json(), list):
            return r.json()
    except:
        pass
    return []

def fetch_timetable_arrival(iata):
    try:
        r = requests.get(
            'https://aviation-edge.com/v2/public/timetable',
            params={
                'key': AVIATION_EDGE_API_KEY,
                'iataCode': iata,
                'type': 'arrival'
            },
            timeout=10
        )
        if r.status_code == 200 and isinstance(r.json(), list):
            return r.json()
    except:
        pass
    return []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/timetable')
def timetable_page():
    return render_template('timetable.html')

@app.route('/api/flights')
def get_all_flights():
    if flight_cache['timestamp']:
        if (datetime.now() - flight_cache['timestamp']).total_seconds() < flight_cache['cache_duration']:
            return jsonify(flight_cache['data'])

    all_flights = []

    with ThreadPoolExecutor(max_workers=6) as executor:
        tasks = []
        for iata in AIRPORTS:
            tasks.append(executor.submit(fetch_live_departure, iata))
            tasks.append(executor.submit(fetch_live_arrival, iata))

        for f in as_completed(tasks):
            all_flights.extend(f.result())

    flight_cache['data'] = all_flights
    flight_cache['timestamp'] = datetime.now()

    return jsonify(all_flights)

@app.route('/api/timetable')
def get_all_timetable():
    if timetable_cache['timestamp']:
        if (datetime.now() - timetable_cache['timestamp']).total_seconds() < timetable_cache['cache_duration']:
            return jsonify(timetable_cache['data'])

    all_rows = []

    with ThreadPoolExecutor(max_workers=6) as executor:
        tasks = []
        for iata in AIRPORTS:
            tasks.append(executor.submit(fetch_timetable_departure, iata))
            tasks.append(executor.submit(fetch_timetable_arrival, iata))

        for f in as_completed(tasks):
            all_rows.extend(f.result())

    timetable_cache['data'] = all_rows
    timetable_cache['timestamp'] = datetime.now()

    return jsonify(all_rows)

if __name__ == '__main__':
    app.run(debug=True)