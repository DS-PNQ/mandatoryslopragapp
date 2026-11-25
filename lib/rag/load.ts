import indexJson from '../../generated/index.json';
import {Retriever} from './retrieve';
import type {IndexFile} from './types';

const index = indexJson as unknown as IndexFile;
let retriever: Retriever | null = null;

export function getIndex(): IndexFile {
  return index;
}

export function getRetriever(): Retriever {
  retriever ??= new Retriever(index);
  return retriever;
}
