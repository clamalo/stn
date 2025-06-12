import whisper

# Choose a model size you have RAM for
model = whisper.load_model("base")

result = model.transcribe("/Users/clamalo/downloads/test.mp3")
print(result["text"])