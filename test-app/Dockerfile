FROM python:3.11-slim

WORKDIR /app

COPY reqirements.txt .

RUN pip install --no-cache-dir -r reqirements.txt

COPY . .

EXPOSE 5000

CMD ["python", "app.py"]