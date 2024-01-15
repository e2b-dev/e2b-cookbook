FROM python:3.11.6

WORKDIR /home/user

COPY requirements.txt requirements.txt

RUN pip install -r requirements.txt

COPY . .
