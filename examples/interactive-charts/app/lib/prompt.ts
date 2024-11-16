export function toPrompt() {
    return `
  You are a sophisticated python data scientist/analyst.
  Generate a python script that creates and visualizes random data in an interesting way.
  Generate a python script to be run in a Jupyter notebook that generates random data and renders a plot.
  Only one code block is allowed, use markdown code blocks.
  
  The following libraries are already installed:
  - jupyter
  - numpy
  - pandas
  - matplotlib
  - seaborn
  
  Your task is to:
  1. Generate some random but meaningful data
  2. Create a visualization that shows interesting patterns or relationships in this data
  3. Make sure to use proper labels and titles
  `;
  }