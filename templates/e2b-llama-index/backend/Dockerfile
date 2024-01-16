FROM public.ecr.aws/docker/library/python:3.11.0-slim-bullseye
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.7.2 /lambda-adapter /opt/extensions/lambda-adapter

ENV POETRY_VERSION=1.5.1

RUN pip install "poetry==$POETRY_VERSION"

COPY pyproject.toml poetry.lock ./

RUN poetry config virtualenvs.create false

RUN poetry install --no-dev --no-interaction --no-ansi

COPY . .
ENV PORT=8080

CMD ["python", "main.py"]
